import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { Suggestion, SuggestionKind } from "./types";
import { getBookmarks, handleAction } from "./store";
import { normalizeUrl } from "./url";
import { notify } from "./userdata";
import { REV_KEYS, bumpRev } from "./revs";

const KEY = "suggestions"; // hash: id -> Suggestion
const MAX_PENDING_PER_USER = 10;
const MAX_STORED = 300;
const KINDS: SuggestionKind[] = ["addLink", "editLink", "removeLink", "other", "newFolder", "editFolder"];

function getRedis() {
  return Redis.fromEnv();
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function all(): Promise<Suggestion[]> {
  const map = await getRedis().hgetall<Record<string, Suggestion>>(KEY);
  return Object.values(map || {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listSuggestions(): Promise<Suggestion[]> {
  return all();
}

export async function listForUser(username: string): Promise<Suggestion[]> {
  const lower = username.toLowerCase();
  return (await all()).filter((s) => s.user.toLowerCase() === lower).slice(0, 30);
}

export async function pendingCount(): Promise<number> {
  return (await all()).filter((s) => s.status === "pending").length;
}

export async function createSuggestion(username: string, body: Record<string, unknown>): Promise<Suggestion> {
  const kind = body.kind as SuggestionKind;
  if (!KINDS.includes(kind)) throw new Error("Pick what kind of change you're suggesting");

  const s: Suggestion = {
    id: uuid(),
    user: username,
    kind,
    status: "pending",
    createdAt: new Date().toISOString(),
    note: clean(body.note, 500) || undefined,
  };

  const data = await getBookmarks();
  if (kind === "addLink") {
    s.name = clean(body.name, 100);
    s.url = normalizeUrl(clean(body.url, 2000));
    s.folderId = clean(body.folderId, 100);
    if (!s.name || !s.url) throw new Error("Add a name and a URL");
    if (!data.folders.some((f) => f.id === s.folderId)) throw new Error("Pick a folder");
    // already on the site, or already suggested?
    const same = (u: string) => { try { return normalizeUrl(u) === s.url; } catch { return false; } };
    const onSite = data.folders.flatMap((f) => f.links.map((l) => ({ f, l }))).find(({ l }) => same(l.url));
    if (onSite) throw new Error(`That's already on the site as “${onSite.l.name}” in ${onSite.f.name}`);
    const twin = (await all()).find((x) => x.status === "pending" && x.kind === "addLink" && x.url && same(x.url));
    if (twin) throw new Error(`${twin.user} already suggested that — give their suggestion an upvote instead`);
  } else if (kind === "newFolder") {
    s.name = clean(body.name, 60);
    s.emoji = clean(body.emoji, 8) || "📁";
    s.description = clean(body.description, 300) || undefined;
    if (!s.name) throw new Error("Give the folder a name");
    if (data.folders.some((f) => f.name.toLowerCase() === s.name!.toLowerCase())) throw new Error("There's already a folder with that name");
  } else if (kind === "editFolder") {
    s.folderId = clean(body.folderId, 100);
    const folder = data.folders.find((f) => f.id === s.folderId);
    if (!folder) throw new Error("Pick which folder you mean");
    s.linkName = folder.name;
    s.name = clean(body.name, 60) || undefined;
    s.description = clean(body.description, 300) || undefined;
    if (s.name === folder.name) s.name = undefined;
    if (s.description === folder.description) s.description = undefined;
    if (!s.name && !s.description) throw new Error("Change the name or description to suggest an edit");
  } else if (kind === "editLink" || kind === "removeLink") {
    s.folderId = clean(body.folderId, 100);
    s.linkId = clean(body.linkId, 100);
    const link = data.folders.find((f) => f.id === s.folderId)?.links.find((l) => l.id === s.linkId);
    if (!link) throw new Error("Pick which website you mean");
    s.linkName = link.name;
    if (kind === "editLink") {
      s.name = clean(body.name, 100) || undefined;
      const url = clean(body.url, 2000);
      s.url = url ? normalizeUrl(url) : undefined;
      const sameUrl = (() => { try { return s.url === normalizeUrl(link.url); } catch { return false; } })();
      // only keep the fields that actually change
      if (s.name === link.name) s.name = undefined;
      if (sameUrl) s.url = undefined;
      if (!s.name && !s.url) throw new Error("Change the name or URL to suggest an edit");
    }
  } else if (!s.note) {
    throw new Error("Write your idea in the box");
  }

  const redis = getRedis();
  const pending = (await listForUser(username)).filter((x) => x.status === "pending").length;
  if (pending >= MAX_PENDING_PER_USER) {
    throw new Error(`You already have ${MAX_PENDING_PER_USER} suggestions waiting — give the admin a moment`);
  }
  const ok = await redis.set(`suggest:cooldown:${username.toLowerCase()}`, 1, { nx: true, ex: 10 });
  if (!ok) throw new Error("Wait a few seconds before suggesting again");

  await redis.hset(KEY, { [s.id]: s });
  await prune();
  await bumpRev(REV_KEYS.suggestions);
  return s;
}

/** Keep the hash small by dropping the oldest resolved suggestions. */
async function prune() {
  const list = await all();
  if (list.length <= MAX_STORED) return;
  const resolved = list.filter((s) => s.status !== "pending").reverse(); // oldest first
  const drop = resolved.slice(0, list.length - MAX_STORED).map((s) => s.id);
  if (drop.length) await getRedis().hdel(KEY, ...drop);
}

async function getOne(id: string): Promise<Suggestion> {
  const s = await getRedis().hget<Suggestion>(KEY, id);
  if (!s) throw new Error("Suggestion not found");
  if (s.status !== "pending") throw new Error("That suggestion was already handled");
  return s;
}

/**
 * Applies the change (with optional admin tweaks) and marks it approved.
 * `auth` is the approving admin (password and/or server-built context), passed through to the bookmark action.
 */
export async function approveSuggestion(id: string, auth: { password?: string; __auth: unknown }, overrides: Record<string, unknown> = {}) {
  const s = await getOne(id);
  const name = clean(overrides.name, 100) || s.name;
  const urlRaw = clean(overrides.url, 2000) || s.url;
  const url = urlRaw ? normalizeUrl(urlRaw) : undefined;
  const folderId = clean(overrides.folderId, 100) || s.folderId;

  if (s.kind === "newFolder") {
    await handleAction("addFolder", { ...auth, name: name || s.name, emoji: s.emoji, description: s.description });
  } else if (s.kind === "editFolder") {
    await handleAction("editFolder", { ...auth, folderId: s.folderId, name: name || s.name, description: s.description });
  } else if (s.kind === "addLink") {
    // approval templates can add tags as it goes in
    const tags = Array.isArray(overrides.tags) ? overrides.tags.map(String).slice(0, 8) : undefined;
    await handleAction("addLink", { ...auth, folderId, name, url, suggestedBy: s.user, ...(tags ? { tags } : {}) });
  } else if (s.kind === "editLink") {
    await handleAction("editLink", { ...auth, folderId: s.folderId, linkId: s.linkId, name, url, suggestedBy: s.user });
  } else if (s.kind === "removeLink") {
    await handleAction("deleteLink", { ...auth, folderId: s.folderId, linkId: s.linkId, suggestedBy: s.user });
  }
  const done: Suggestion = { ...s, status: "approved", resolvedAt: new Date().toISOString() };
  await getRedis().hset(KEY, { [id]: done });
  await bumpRev(REV_KEYS.suggestions);
  notify(s.user, { kind: "suggestion", text: `Your suggestion was approved${name ? `: “${name}”` : ""}` }).catch(() => {});
  return done;
}

export async function rejectSuggestion(id: string, reason?: string) {
  const s = await getOne(id);
  const done: Suggestion = {
    ...s,
    status: "rejected",
    resolvedAt: new Date().toISOString(),
    resolvedNote: clean(reason, 300) || undefined,
  };
  await getRedis().hset(KEY, { [id]: done });
  await bumpRev(REV_KEYS.suggestions);
  notify(s.user, { kind: "suggestion", text: `Your suggestion was declined${done.resolvedNote ? `: “${done.resolvedNote}”` : ""}` }).catch(() => {});
  return done;
}

/** Anyone logged in can upvote a suggestion (not their own); again to take it back. */
export async function voteSuggestion(id: string, user: string) {
  const s = await getRedis().hget<Suggestion>(KEY, id);
  if (!s) throw new Error("Suggestion not found");
  const who = user.toLowerCase();
  if (s.user.toLowerCase() === who) throw new Error("You can't upvote your own suggestion");
  const votes = s.votes || [];
  s.votes = votes.includes(who) ? votes.filter((v) => v !== who) : [...votes, who];
  await getRedis().hset(KEY, { [id]: s });
  await bumpRev(REV_KEYS.suggestions);
  return s;
}

/** Discuss a suggestion; the person who made it (and others in the thread) hear about it. */
export async function commentSuggestion(id: string, user: string, text: string) {
  const s = await getRedis().hget<Suggestion>(KEY, id);
  if (!s) throw new Error("Suggestion not found");
  const t = text.trim().slice(0, 500);
  if (!t) throw new Error("Write a comment first");
  const comments = s.comments || [];
  if (comments.length >= 50) throw new Error("That's a long discussion already");
  s.comments = [...comments, { id: uuid(), user, text: t, at: new Date().toISOString() }];
  await getRedis().hset(KEY, { [id]: s });
  await bumpRev(REV_KEYS.suggestions);
  const told = new Set([user.toLowerCase()]);
  for (const name of [s.user, ...comments.map((c) => c.user)]) {
    if (told.has(name.toLowerCase())) continue;
    told.add(name.toLowerCase());
    const own = name.toLowerCase() === s.user.toLowerCase();
    notify(name, { kind: "comment", from: user, text: `${user} commented on ${own ? "your" : "a"} suggestion: “${t.slice(0, 60)}”`, link: "/community?tab=roadmap" }).catch(() => {});
  }
  return s;
}

export async function setStage(id: string, stage: unknown) {
  const s = await getRedis().hget<Suggestion>(KEY, id);
  if (!s) throw new Error("Suggestion not found");
  s.stage = stage === "planned" || stage === "in progress" || stage === "done" ? stage : undefined;
  await getRedis().hset(KEY, { [id]: s });
  await bumpRev(REV_KEYS.suggestions);
  if (s.stage) notify(s.user, { kind: "suggestion", text: `Your idea is now “${s.stage}”: ${(s.note || s.name || "").slice(0, 60)}`, link: "/community?tab=roadmap" }).catch(() => {});
  return s;
}

/** Everything people can see on the roadmap / suggestion board (no admin notes). */
export async function publicSuggestions() {
  return (await all()).filter((s) => s.status !== "rejected").map(({ resolvedNote: _n, ...s }) => s).slice(0, 200);
}

export async function deleteSuggestion(id: string) {
  await getRedis().hdel(KEY, id);
  await bumpRev(REV_KEYS.suggestions);
}
