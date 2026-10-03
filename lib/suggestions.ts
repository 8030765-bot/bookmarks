import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { Suggestion, SuggestionKind } from "./types";
import { getBookmarks, handleAction } from "./store";
import { normalizeUrl } from "./url";
import { notify } from "./userdata";

const KEY = "suggestions"; // hash: id -> Suggestion
const MAX_PENDING_PER_USER = 10;
const MAX_STORED = 300;
const KINDS: SuggestionKind[] = ["addLink", "editLink", "removeLink", "other"];

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

  if (s.kind === "addLink") {
    await handleAction("addLink", { ...auth, folderId, name, url, suggestedBy: s.user });
  } else if (s.kind === "editLink") {
    await handleAction("editLink", { ...auth, folderId: s.folderId, linkId: s.linkId, name, url, suggestedBy: s.user });
  } else if (s.kind === "removeLink") {
    await handleAction("deleteLink", { ...auth, folderId: s.folderId, linkId: s.linkId, suggestedBy: s.user });
  }
  const done: Suggestion = { ...s, status: "approved", resolvedAt: new Date().toISOString() };
  await getRedis().hset(KEY, { [id]: done });
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
  notify(s.user, { kind: "suggestion", text: `Your suggestion was declined${done.resolvedNote ? `: “${done.resolvedNote}”` : ""}` }).catch(() => {});
  return done;
}

export async function deleteSuggestion(id: string) {
  await getRedis().hdel(KEY, id);
}
