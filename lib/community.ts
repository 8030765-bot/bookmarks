import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { normalizeUrl } from "./url";
import { notify } from "./userdata";
import { REV_KEYS, bumpRev } from "./revs";

/**
 * Community boards: link requests, Q&A, tips, the guestbook, shoutouts,
 * challenge entries and link-of-the-month nominations — all the same
 * shape, kept in one hash per board. Plus events, a small wiki, flair,
 * thank-yous, and the daily would-you-rather.
 */
export type BoardKind = "requests" | "qa" | "tips" | "guestbook" | "shoutouts" | "challenge" | "lotm";
export const BOARD_KINDS: BoardKind[] = ["requests", "qa", "tips", "guestbook", "shoutouts", "challenge", "lotm"];

export interface BoardReply { id: string; user: string; text: string; url?: string; name?: string; at: string; votes: string[] }
export interface BoardPost {
  id: string;
  kind: BoardKind;
  user: string;
  title?: string;
  text: string;
  url?: string;
  /** shoutouts: who it's for */
  to?: string;
  emoji?: string;
  at: string;
  votes: string[];
  replies: BoardReply[];
  /** requests / Q&A: the reply that solved it */
  acceptedId?: string;
  /** challenge + link-of-the-month: which round (e.g. "2026-10") */
  round?: string;
}

const MAX_POSTS: Record<BoardKind, number> = { requests: 200, qa: 300, tips: 200, guestbook: 300, shoutouts: 200, challenge: 300, lotm: 300 };
const boardKey = (k: BoardKind) => `board:${k}`;
function getRedis() {
  return Redis.fromEnv();
}
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const cleanUrlOrEmpty = (v: unknown) => {
  const raw = clean(v, 2000);
  if (!raw) return "";
  return normalizeUrl(raw);
};
export const monthRound = (d = new Date()) => d.toISOString().slice(0, 7);

export async function listPosts(kind: BoardKind): Promise<BoardPost[]> {
  const raw = (await getRedis().hgetall<Record<string, BoardPost>>(boardKey(kind))) || {};
  return Object.values(raw).sort((a, b) => b.at.localeCompare(a.at));
}
async function getPost(kind: BoardKind, id: string): Promise<BoardPost> {
  const p = await getRedis().hget<BoardPost>(boardKey(kind), id);
  if (!p) throw new Error("That post is gone");
  return p;
}
async function savePost(p: BoardPost) {
  await getRedis().hset(boardKey(p.kind), { [p.id]: p });
  await bumpRev(REV_KEYS.suggestions);
}

/** Keep each board a sensible size by dropping the oldest posts. */
async function prune(kind: BoardKind) {
  const posts = await listPosts(kind);
  const drop = posts.slice(MAX_POSTS[kind]).map((p) => p.id);
  if (drop.length) await getRedis().hdel(boardKey(kind), ...drop);
}

export async function createPost(kind: BoardKind, user: string, input: Record<string, unknown>, existingUsers: string[]) {
  if (!BOARD_KINDS.includes(kind)) throw new Error("Unknown board");
  const text = clean(input.text, kind === "qa" ? 2000 : 500);
  const p: BoardPost = { id: uuid(), kind, user, text, at: new Date().toISOString(), votes: [], replies: [] };
  if (kind === "qa" || kind === "tips" || kind === "requests") p.title = clean(input.title, 120) || undefined;
  if (kind === "qa" && !p.title) throw new Error("Give your question a title");
  if (kind === "requests" && !text) throw new Error("Say what kind of website you're looking for");
  if (kind === "challenge" || kind === "lotm") {
    p.url = cleanUrlOrEmpty(input.url);
    if (!p.url) throw new Error("Add the link you're entering");
    p.title = clean(input.title, 100) || undefined;
    p.round = kind === "lotm" ? monthRound() : clean(input.round, 40) || monthRound();
    const mine = (await listPosts(kind)).filter((x) => x.round === p.round && x.user.toLowerCase() === user.toLowerCase());
    if (mine.length >= 3) throw new Error("You've entered 3 already this round");
  }
  if (kind === "shoutouts") {
    p.to = clean(input.to, 20).replace(/^@/, "");
    if (!existingUsers.some((u) => u.toLowerCase() === p.to!.toLowerCase())) throw new Error("Pick someone to shout out");
    if (p.to.toLowerCase() === user.toLowerCase()) throw new Error("Shout out someone else!");
  }
  if (kind === "guestbook") p.emoji = clean(input.emoji, 8) || undefined;
  if (!p.text && kind !== "challenge" && kind !== "lotm") throw new Error("Write something first");
  await savePost(p);
  await prune(kind);
  if (kind === "shoutouts" && p.to) notify(p.to, { kind: "like", from: user, text: `${user} gave you a shoutout: “${p.text.slice(0, 80)}”`, link: "/community?tab=shoutouts" }).catch(() => {});
  return p;
}

/** Up-vote a post (or one reply); voting again takes it back. */
export async function votePost(kind: BoardKind, id: string, user: string, replyId?: string) {
  const p = await getPost(kind, id);
  const who = user.toLowerCase();
  const toggle = (list: string[]) => (list.includes(who) ? list.filter((x) => x !== who) : [...list, who]);
  if (replyId) {
    const r = p.replies.find((x) => x.id === replyId);
    if (!r) throw new Error("That answer is gone");
    if (r.user.toLowerCase() === who) throw new Error("You can't vote for your own answer");
    r.votes = toggle(r.votes);
  } else {
    if (p.user.toLowerCase() === who && kind !== "guestbook") throw new Error("You can't vote for your own post");
    p.votes = toggle(p.votes);
  }
  await savePost(p);
  return p;
}

/** Answer a question or link request (requests can include the link). */
export async function replyPost(kind: BoardKind, id: string, user: string, input: Record<string, unknown>) {
  const p = await getPost(kind, id);
  const text = clean(input.text, 1500);
  const url = cleanUrlOrEmpty(input.url);
  if (!text && !url) throw new Error("Write an answer first");
  if (p.replies.length >= 100) throw new Error("This one has plenty of answers already");
  const r: BoardReply = { id: uuid(), user, text, url: url || undefined, name: clean(input.name, 100) || undefined, at: new Date().toISOString(), votes: [] };
  p.replies.push(r);
  await savePost(p);
  if (p.user.toLowerCase() !== user.toLowerCase()) {
    notify(p.user, { kind: "comment", from: user, text: `${user} answered “${(p.title || p.text).slice(0, 60)}”`, link: `/community?tab=${kind}&post=${p.id}` }).catch(() => {});
  }
  return p;
}

/** The asker marks which answer solved it (or a moderator does). */
export async function acceptReply(kind: BoardKind, id: string, user: string, replyId: string, staff: boolean) {
  const p = await getPost(kind, id);
  if (!staff && p.user.toLowerCase() !== user.toLowerCase()) throw new Error("Only the person who asked can pick the answer");
  const r = p.replies.find((x) => x.id === replyId);
  if (!r && replyId) throw new Error("That answer is gone");
  p.acceptedId = replyId || undefined;
  await savePost(p);
  if (r && r.user.toLowerCase() !== p.user.toLowerCase()) {
    notify(r.user, { kind: "like", from: user, text: `Your answer to “${(p.title || p.text).slice(0, 60)}” was picked as the best one ✅`, link: `/community?tab=${kind}&post=${p.id}` }).catch(() => {});
  }
  return p;
}

export async function deletePost(kind: BoardKind, id: string, user: string, staff: boolean, replyId?: string) {
  const p = await getPost(kind, id);
  const who = user.toLowerCase();
  if (replyId) {
    const r = p.replies.find((x) => x.id === replyId);
    if (!r) return p;
    if (!staff && r.user.toLowerCase() !== who) throw new Error("You can only delete your own answers");
    p.replies = p.replies.filter((x) => x.id !== replyId);
    if (p.acceptedId === replyId) p.acceptedId = undefined;
    await savePost(p);
    return p;
  }
  if (!staff && p.user.toLowerCase() !== who) throw new Error("You can only delete your own posts");
  await getRedis().hdel(boardKey(kind), id);
  await bumpRev(REV_KEYS.suggestions);
  return null;
}

/* ---------- people's standing: answers, helpers, points ---------- */
export async function helperStats(): Promise<Record<string, { answers: number; accepted: number; helpful: number }>> {
  const stats: Record<string, { answers: number; accepted: number; helpful: number }> = {};
  for (const kind of ["qa", "requests"] as BoardKind[]) {
    for (const p of await listPosts(kind)) {
      for (const r of p.replies) {
        const k = r.user.toLowerCase();
        stats[k] ||= { answers: 0, accepted: 0, helpful: 0 };
        stats[k].answers++;
        stats[k].helpful += r.votes.length;
        if (p.acceptedId === r.id) stats[k].accepted++;
      }
    }
  }
  return stats;
}

/* ---------- events ---------- */
export interface SiteEvent { id: string; title: string; date: string; endDate?: string; description?: string; createdBy: string; at: string }
const EVENTS_KEY = "events";
export async function listEvents(): Promise<SiteEvent[]> {
  const raw = (await getRedis().hgetall<Record<string, SiteEvent>>(EVENTS_KEY)) || {};
  return Object.values(raw).sort((a, b) => a.date.localeCompare(b.date));
}
export async function saveEvent(user: string, input: Record<string, unknown>) {
  const title = clean(input.title, 100);
  const date = clean(input.date, 30);
  if (!title || !Number.isFinite(Date.parse(date))) throw new Error("An event needs a title and a date");
  const end = clean(input.endDate, 30);
  const e: SiteEvent = {
    id: typeof input.id === "string" && /^[\w-]{1,40}$/.test(input.id) ? input.id : uuid(),
    title, date: new Date(date).toISOString(),
    endDate: end && Number.isFinite(Date.parse(end)) ? new Date(end).toISOString() : undefined,
    description: clean(input.description, 500) || undefined, createdBy: user, at: new Date().toISOString(),
  };
  await getRedis().hset(EVENTS_KEY, { [e.id]: e });
  await bumpRev(REV_KEYS.suggestions);
  return e;
}
export async function deleteEvent(id: string) {
  await getRedis().hdel(EVENTS_KEY, id);
  await bumpRev(REV_KEYS.suggestions);
}

/* ---------- wiki ---------- */
export interface WikiPage { slug: string; title: string; body: string; updatedBy: string; updatedAt: string; locked?: boolean; history: { body: string; by: string; at: string }[] }
const WIKI_KEY = "wiki";
export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
export async function listWiki(): Promise<Omit<WikiPage, "body" | "history">[]> {
  const raw = (await getRedis().hgetall<Record<string, WikiPage>>(WIKI_KEY)) || {};
  return Object.values(raw).map(({ body: _b, history: _h, ...rest }) => rest).sort((a, b) => a.title.localeCompare(b.title));
}
export async function getWiki(slug: string): Promise<WikiPage | null> {
  return getRedis().hget<WikiPage>(WIKI_KEY, slugify(slug));
}
export async function saveWiki(user: string, input: Record<string, unknown>, staff: boolean) {
  const title = clean(input.title, 80);
  const slug = slugify(clean(input.slug, 60) || title);
  if (!title || !slug) throw new Error("A page needs a title");
  const body = clean(input.body, 20000);
  const existing = await getWiki(slug);
  if (existing?.locked && !staff) throw new Error("This page is locked — only moderators can edit it");
  const page: WikiPage = {
    slug, title, body, updatedBy: user, updatedAt: new Date().toISOString(),
    locked: staff && typeof input.locked === "boolean" ? input.locked || undefined : existing?.locked,
    history: existing ? [{ body: existing.body, by: existing.updatedBy, at: existing.updatedAt }, ...existing.history].slice(0, 10) : [],
  };
  await getRedis().hset(WIKI_KEY, { [slug]: page });
  return page;
}
export async function deleteWiki(slug: string) {
  await getRedis().hdel(WIKI_KEY, slugify(slug));
}

/* ---------- flair (admin-given titles) ---------- */
const FLAIR_KEY = "flair";
export async function allFlair(): Promise<Record<string, string>> {
  return ((await getRedis().hgetall<Record<string, string>>(FLAIR_KEY)) || {}) as Record<string, string>;
}
export async function setFlair(username: string, text: string) {
  const t = text.trim().slice(0, 24);
  if (t) await getRedis().hset(FLAIR_KEY, { [username.toLowerCase()]: t });
  else await getRedis().hdel(FLAIR_KEY, username.toLowerCase());
}

/* ---------- thank-yous on links ---------- */
const THANKS_KEY = "thanks"; // hash: linkId -> [usernames]
export async function allThanks(): Promise<Record<string, string[]>> {
  return ((await getRedis().hgetall<Record<string, string[]>>(THANKS_KEY)) || {}) as Record<string, string[]>;
}
export async function thank(linkId: string, user: string, addedBy: string | undefined, linkName: string) {
  if (!/^[\w-]{1,100}$/.test(linkId)) throw new Error("Invalid link");
  const redis = getRedis();
  const list = ((await redis.hget<string[]>(THANKS_KEY, linkId)) || []) as string[];
  const who = user.toLowerCase();
  if (list.includes(who)) return list;
  if (addedBy?.toLowerCase() === who) throw new Error("You added this one!");
  const next = [...list, who];
  await redis.hset(THANKS_KEY, { [linkId]: next });
  if (addedBy) notify(addedBy, { kind: "like", from: user, text: `🙏 ${user} said thanks for adding “${linkName}”`, link: `/#link-${linkId}` }).catch(() => {});
  return next;
}

/* ---------- daily would-you-rather ---------- */
export async function wyrVote(day: string, user: string, choice: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (choice !== 0 && choice !== 1)) throw new Error("Pick one");
  const key = `wyr:${day}`;
  const redis = getRedis();
  await redis.hset(key, { [user.toLowerCase()]: choice });
  await redis.expire(key, 3 * 86400);
  return wyrTally(day);
}
export async function wyrTally(day: string, user?: string | null) {
  const raw = (await getRedis().hgetall<Record<string, number>>(`wyr:${day}`)) || {};
  const votes = Object.values(raw).map(Number);
  const mine = user ? raw[user.toLowerCase()] : undefined;
  return { a: votes.filter((v) => v === 0).length, b: votes.filter((v) => v === 1).length, mine: mine === undefined ? null : Number(mine) };
}

/* ---------- community notes waiting for a moderator ---------- */
export interface PendingNote { id: string; linkId: string; linkName: string; text: string; by: string; at: string }
const NOTES_KEY = "notes:pending";
export async function proposeNote(user: string, linkId: string, linkName: string, text: string) {
  const t = clean(text, 280);
  if (t.length < 4) throw new Error("Write a short note first");
  const all = await pendingNotes();
  if (all.filter((n) => n.by.toLowerCase() === user.toLowerCase()).length >= 10) throw new Error("You have 10 notes waiting already");
  const n: PendingNote = { id: uuid(), linkId, linkName: linkName.slice(0, 100), text: t, by: user, at: new Date().toISOString() };
  await getRedis().hset(NOTES_KEY, { [n.id]: n });
  await bumpRev(REV_KEYS.suggestions);
  return n;
}
export async function pendingNotes(): Promise<PendingNote[]> {
  const raw = (await getRedis().hgetall<Record<string, PendingNote>>(NOTES_KEY)) || {};
  return Object.values(raw).sort((a, b) => a.at.localeCompare(b.at));
}
export async function takeNote(id: string): Promise<PendingNote | null> {
  const n = await getRedis().hget<PendingNote>(NOTES_KEY, id);
  await getRedis().hdel(NOTES_KEY, id);
  await bumpRev(REV_KEYS.suggestions);
  return n;
}
