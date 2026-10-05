import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { notify } from "./userdata";
import { REV_KEYS, bumpRev } from "./revs";

/**
 * Moderation and site controls that live outside the bookmarks blob, so
 * they can be checked on every request without loading the whole list:
 * site switches, timeouts, warnings, mod notes, frozen accounts, groups
 * (contributors, beta testers), reports, invites, daily stats and errors.
 */
function getRedis() {
  return Redis.fromEnv();
}

/* ---------- site switches (a small hash, cached briefly in memory) ---------- */
export interface SiteFlags {
  /** read-only for everyone except admins */
  maintenance?: boolean;
  maintenanceMessage?: string;
  signups?: "open" | "closed" | "invite";
  /** members' new links wait for an admin */
  approveLinks?: boolean;
  /** accounts younger than a day can only suggest links */
  newAccountWait?: boolean;
  /** multiplies every rate limit (0.5 = stricter, 3 = looser) */
  rateScale?: number;
  blockedNames?: string[];
  wordFilter?: string[];
  /** what moderators may do (missing = allowed) */
  modPerms?: Record<string, boolean>;
  /** features only admins and beta testers see */
  betaFlags?: string[];
  pollsEnabled?: boolean;
  suggestionsEnabled?: boolean;
  communityEnabled?: boolean;
}
const FLAGS_KEY = "siteflags";
let flagsCache: { at: number; flags: SiteFlags } | null = null;
export async function getFlags(): Promise<SiteFlags> {
  if (flagsCache && Date.now() - flagsCache.at < 10_000) return flagsCache.flags;
  const flags = ((await getRedis().get<SiteFlags>(FLAGS_KEY)) || {}) as SiteFlags;
  flagsCache = { at: Date.now(), flags };
  return flags;
}
export async function setFlags(patch: Partial<SiteFlags>) {
  const next = { ...(await getRedis().get<SiteFlags>(FLAGS_KEY) || {}), ...patch } as SiteFlags;
  for (const k of Object.keys(next) as (keyof SiteFlags)[]) if (next[k] === undefined) delete next[k];
  await getRedis().set(FLAGS_KEY, next);
  flagsCache = { at: Date.now(), flags: next };
  return next;
}
export const MOD_PERMS: { id: string; label: string }[] = [
  { id: "ban", label: "Mute, unmute and time people out" },
  { id: "warn", label: "Send warnings" },
  { id: "notes", label: "Write private notes on people" },
  { id: "deleteMessages", label: "Delete chat messages" },
  { id: "suggestions", label: "Decline suggestions and set roadmap stages" },
  { id: "reports", label: "Handle reports" },
  { id: "events", label: "Edit the events calendar" },
  { id: "logout", label: "Log people out everywhere" },
];
export async function modCan(role: string | null | undefined, perm: string) {
  if (role === "owner" || role === "admin") return true;
  if (role !== "mod") return false;
  return (await getFlags()).modPerms?.[perm] !== false;
}

const isAdminRole = (role?: string | null) => role === "owner" || role === "admin";
/** Read-only mode: only admins can change things. */
export async function assertWritable(role?: string | null) {
  if (isAdminRole(role)) return;
  const f = await getFlags();
  if (f.maintenance) throw new Error(`Read-only for maintenance${f.maintenanceMessage ? ` — ${f.maintenanceMessage}` : ""}. Try again soon.`);
}

/* ---------- usernames ---------- */
const RUDE = ["fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigg", "fag", "retard", "whore", "slut", "rape", "nazi", "hitler", "porn", "sex", "cock", "penis", "vagina", "anal", "twat", "wank"];
const leet = (s: string) => s.toLowerCase().replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/[^a-z]/g, "");
/** Throws if a username is on the admins' blocked list or is rude. */
export async function checkNameAllowed(name: string) {
  const plain = leet(name);
  if (RUDE.some((w) => plain.includes(w))) throw new Error("Please pick a different username");
  const blocked = (await getFlags()).blockedNames || [];
  if (blocked.some((b) => b && (name.toLowerCase() === b || plain.includes(leet(b))))) throw new Error("That username isn't allowed here — pick another");
}

/* ---------- word filter for chat and posts ---------- */
export async function filterWords(text: string) {
  const words = (await getFlags()).wordFilter || [];
  let out = text;
  for (const w of words) {
    if (!w) continue;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${esc}\\b`, "gi"), (m) => "★".repeat(Math.min(m.length, 8)));
  }
  return out;
}

/* ---------- timeouts, warnings, notes, frozen ---------- */
const TIMEOUTS_KEY = "timeouts"; // hash: user -> { until, reason, by }
const FROZEN_KEY = "frozen"; // set
const BANNED_KEY = "chat:banned"; // set, shared with chat
export interface Timeout { until: string; reason?: string; by: string }
export async function getTimeouts(): Promise<Record<string, Timeout>> {
  const all = ((await getRedis().hgetall<Record<string, Timeout>>(TIMEOUTS_KEY)) || {}) as Record<string, Timeout>;
  const now = Date.now();
  const expired = Object.keys(all).filter((u) => Date.parse(all[u].until) <= now);
  if (expired.length) {
    await getRedis().hdel(TIMEOUTS_KEY, ...expired);
    expired.forEach((u) => delete all[u]);
  }
  return all;
}
export async function setTimeoutFor(user: string, hours: number, by: string, reason?: string) {
  const h = Math.max(1, Math.min(24 * 30, Math.round(hours)));
  const until = new Date(Date.now() + h * 3600_000).toISOString();
  await getRedis().hset(TIMEOUTS_KEY, { [user.toLowerCase()]: { until, reason: reason?.slice(0, 200) || undefined, by } });
  await logMod(user, { action: "timeout", by, reason, until });
  notify(user, { kind: "system", text: `You've been timed out for ${h} hour${h === 1 ? "" : "s"}${reason ? `: ${reason}` : ""}. You can still browse.` }).catch(() => {});
  return until;
}
export async function clearTimeoutFor(user: string, by: string) {
  await getRedis().hdel(TIMEOUTS_KEY, user.toLowerCase());
  await logMod(user, { action: "end timeout", by });
}
/** Why this person can't post right now (muted, timed out), or null. */
export async function restriction(user: string): Promise<string | null> {
  const u = user.toLowerCase();
  const redis = getRedis();
  const [banned, t] = await Promise.all([redis.sismember(BANNED_KEY, u), redis.hget<Timeout>(TIMEOUTS_KEY, u)]);
  if (banned) return "You're muted by an admin, so you can't post or change things right now";
  if (t && Date.parse(t.until) > Date.now()) return `You're muted (timed out) until ${new Date(t.until).toUTCString()}`;
  return null;
}
export async function setFrozen(user: string, on: boolean, by: string) {
  if (on) await getRedis().sadd(FROZEN_KEY, user.toLowerCase());
  else await getRedis().srem(FROZEN_KEY, user.toLowerCase());
  await logMod(user, { action: on ? "freeze edits" : "unfreeze edits", by });
}
export async function isFrozen(user: string) {
  return !!(await getRedis().sismember(FROZEN_KEY, user.toLowerCase()));
}
export async function listFrozen(): Promise<string[]> {
  return getRedis().smembers(FROZEN_KEY);
}

export interface ModEntry { at: string; action: string; by: string; reason?: string; until?: string }
const modlogKey = (u: string) => `modlog:${u.toLowerCase()}`;
export async function logMod(user: string, e: Omit<ModEntry, "at">) {
  const redis = getRedis();
  await redis.lpush(modlogKey(user), { ...e, reason: e.reason?.slice(0, 200) || undefined, at: new Date().toISOString() });
  await redis.ltrim(modlogKey(user), 0, 49);
}
export async function modHistory(user: string): Promise<ModEntry[]> {
  return getRedis().lrange<ModEntry>(modlogKey(user), 0, 49);
}
export async function warnUser(user: string, by: string, reason: string) {
  const r = reason.trim().slice(0, 300);
  if (!r) throw new Error("Say what the warning is for");
  await notify(user, { kind: "system", text: `⚠️ A warning from the moderators: ${r}` });
  await logMod(user, { action: "warning", by, reason: r });
}

export interface ModNote { id: string; by: string; at: string; text: string }
const NOTES_KEY = "modnotes"; // hash: user -> notes
export async function modNotes(user: string): Promise<ModNote[]> {
  return ((await getRedis().hget<ModNote[]>(NOTES_KEY, user.toLowerCase())) || []) as ModNote[];
}
export async function allModNoteCounts(): Promise<Record<string, number>> {
  const all = ((await getRedis().hgetall<Record<string, ModNote[]>>(NOTES_KEY)) || {}) as Record<string, ModNote[]>;
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length]));
}
export async function addModNote(user: string, by: string, text: string) {
  const t = text.trim().slice(0, 500);
  if (!t) throw new Error("Write a note first");
  const list = [{ id: uuid(), by, at: new Date().toISOString(), text: t }, ...(await modNotes(user))].slice(0, 50);
  await getRedis().hset(NOTES_KEY, { [user.toLowerCase()]: list });
  return list;
}
export async function deleteModNote(user: string, id: string) {
  const list = (await modNotes(user)).filter((n) => n.id !== id);
  if (list.length) await getRedis().hset(NOTES_KEY, { [user.toLowerCase()]: list });
  else await getRedis().hdel(NOTES_KEY, user.toLowerCase());
  return list;
}

/* ---------- groups: contributors (add links without approval) and beta testers ---------- */
export type Group = "contributors" | "beta";
const groupKey = (g: Group) => `group:${g}`;
export async function setGroup(g: Group, user: string, on: boolean) {
  if (on) await getRedis().sadd(groupKey(g), user.toLowerCase());
  else await getRedis().srem(groupKey(g), user.toLowerCase());
}
export async function inGroup(g: Group, user: string | null | undefined) {
  if (!user) return false;
  return !!(await getRedis().sismember(groupKey(g), user.toLowerCase()));
}
export async function listGroup(g: Group): Promise<string[]> {
  return getRedis().smembers(groupKey(g));
}

/* ---------- username history ---------- */
const NAMES_KEY = "namehistory"; // hash: current lowercase name -> earlier names
export async function recordRename(oldName: string, newName: string) {
  const redis = getRedis();
  const before = ((await redis.hget<string[]>(NAMES_KEY, oldName.toLowerCase())) || []) as string[];
  await redis.hset(NAMES_KEY, { [newName.toLowerCase()]: [oldName, ...before].slice(0, 20) });
  if (oldName.toLowerCase() !== newName.toLowerCase()) await redis.hdel(NAMES_KEY, oldName.toLowerCase());
}
export async function nameHistory(): Promise<Record<string, string[]>> {
  return ((await getRedis().hgetall<Record<string, string[]>>(NAMES_KEY)) || {}) as Record<string, string[]>;
}

/* ---------- reports ---------- */
export interface Report { id: string; kind: "link" | "message" | "post" | "user" | "picture"; targetId: string; targetName: string; reason: string; by: string; at: string; extra?: string }
const REPORTS_KEY = "reports";
export async function createReport(by: string, input: Record<string, unknown>) {
  const kind = String(input.kind || "");
  if (!["link", "message", "post", "user", "picture"].includes(kind)) throw new Error("Unknown kind of report");
  const targetId = String(input.targetId || "").slice(0, 120);
  if (!targetId) throw new Error("Missing what you're reporting");
  const reason = String(input.reason || "").trim().slice(0, 300);
  if (!reason) throw new Error("Say what's wrong");
  const all = await listReports();
  if (all.filter((r) => r.by.toLowerCase() === by.toLowerCase()).length >= 20) throw new Error("You have lots of reports waiting already — thanks!");
  if (all.some((r) => r.by.toLowerCase() === by.toLowerCase() && r.targetId === targetId)) throw new Error("You've already reported this — a moderator will look");
  const r: Report = {
    id: uuid(), kind: kind as Report["kind"], targetId, targetName: String(input.targetName || "").slice(0, 120), reason, by,
    at: new Date().toISOString(), extra: typeof input.extra === "string" ? input.extra.slice(0, 300) : undefined,
  };
  await getRedis().hset(REPORTS_KEY, { [r.id]: r });
  await bumpRev(REV_KEYS.suggestions);
  return r;
}
export async function listReports(): Promise<Report[]> {
  const raw = ((await getRedis().hgetall<Record<string, Report>>(REPORTS_KEY)) || {}) as Record<string, Report>;
  return Object.values(raw).sort((a, b) => a.at.localeCompare(b.at));
}
export async function resolveReport(id: string) {
  const r = await getRedis().hget<Report>(REPORTS_KEY, id);
  await getRedis().hdel(REPORTS_KEY, id);
  await bumpRev(REV_KEYS.suggestions);
  return r;
}

/* ---------- invite codes ---------- */
export interface Invite { code: string; by: string; at: string; uses: number; maxUses: number; expiresAt?: string }
const INVITES_KEY = "invites";
export async function createInvite(by: string, maxUses: number, days: number) {
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  const inv: Invite = {
    code, by, at: new Date().toISOString(), uses: 0, maxUses: Math.max(1, Math.min(500, Math.round(maxUses) || 1)),
    expiresAt: days > 0 ? new Date(Date.now() + Math.min(365, days) * 86400_000).toISOString() : undefined,
  };
  await getRedis().hset(INVITES_KEY, { [code]: inv });
  return inv;
}
export async function listInvites(): Promise<Invite[]> {
  const raw = ((await getRedis().hgetall<Record<string, Invite>>(INVITES_KEY)) || {}) as Record<string, Invite>;
  return Object.values(raw).sort((a, b) => b.at.localeCompare(a.at));
}
export async function deleteInvite(code: string) {
  await getRedis().hdel(INVITES_KEY, code.toUpperCase());
}
/** Check an invite code and use one of its places. */
export async function useInvite(code: string) {
  const c = code.trim().toUpperCase();
  const inv = c ? await getRedis().hget<Invite>(INVITES_KEY, c) : null;
  if (!inv || inv.uses >= inv.maxUses || (inv.expiresAt && Date.parse(inv.expiresAt) < Date.now())) {
    throw new Error("You need a valid invite code to sign up right now");
  }
  inv.uses++;
  await getRedis().hset(INVITES_KEY, { [c]: inv });
}
/** Before signing up: is it allowed, and with which invite? */
export async function checkSignup(username: string, invite?: string) {
  const f = await getFlags();
  await checkNameAllowed(username);
  if (f.signups === "closed") throw new Error("Sign-ups are closed at the moment — ask an admin");
  if (f.signups === "invite") await useInvite(invite || "");
}

/* ---------- daily stats for the dashboard charts ---------- */
const statKey = (day: string) => `stats:${day}`;
export const today = () => new Date().toISOString().slice(0, 10);
export async function bumpStat(field: "signups" | "clicks" | "messages" | "links" | "posts", by = 1) {
  try {
    const key = statKey(today());
    const redis = getRedis();
    const n = await redis.hincrby(key, field, by);
    if (n === by) await redis.expire(key, 120 * 86400);
  } catch {
    // stats are nice to have, never worth failing a request over
  }
}
export async function getStats(days = 14): Promise<{ day: string; signups: number; clicks: number; messages: number; links: number; posts: number }[]> {
  const list: string[] = [];
  for (let i = days - 1; i >= 0; i--) list.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
  const rows = await Promise.all(list.map((d) => getRedis().hgetall<Record<string, number>>(statKey(d))));
  return list.map((day, i) => {
    const r = rows[i] || {};
    return { day, signups: Number(r.signups || 0), clicks: Number(r.clicks || 0), messages: Number(r.messages || 0), links: Number(r.links || 0), posts: Number(r.posts || 0) };
  });
}

/* ---------- recent server errors ---------- */
const ERRORS_KEY = "errors";
export interface ServerError { at: string; message: string; where?: string }
export function logError(message: string, where?: string) {
  const redis = getRedis();
  redis.lpush(ERRORS_KEY, { at: new Date().toISOString(), message: message.slice(0, 300), where })
    .then(() => redis.ltrim(ERRORS_KEY, 0, 99))
    .catch(() => {});
}
export async function listErrors(): Promise<ServerError[]> {
  return getRedis().lrange<ServerError>(ERRORS_KEY, 0, 99);
}
export async function clearErrors() {
  await getRedis().del(ERRORS_KEY);
}

/* ---------- admin board: pinned notes, to-dos and the mods' shared notes ---------- */
export interface BoardItem { id: string; kind: "note" | "todo"; text: string; by: string; at: string; pinned?: boolean; done?: boolean }
const BOARD_KEY = "adminboard";
export async function listAdminBoard(): Promise<BoardItem[]> {
  const raw = ((await getRedis().hgetall<Record<string, BoardItem>>(BOARD_KEY)) || {}) as Record<string, BoardItem>;
  return Object.values(raw).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Number(!!a.done) - Number(!!b.done) || b.at.localeCompare(a.at));
}
export async function saveAdminBoard(by: string, input: Record<string, unknown>) {
  const id = typeof input.id === "string" && /^[\w-]{1,40}$/.test(input.id) ? input.id : uuid();
  const existing = await getRedis().hget<BoardItem>(BOARD_KEY, id);
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 500) : existing?.text || "";
  if (!text) throw new Error("Write something first");
  const item: BoardItem = {
    id, kind: input.kind === "todo" ? "todo" : existing?.kind || "note", text, by: existing?.by || by, at: existing?.at || new Date().toISOString(),
    pinned: typeof input.pinned === "boolean" ? input.pinned || undefined : existing?.pinned,
    done: typeof input.done === "boolean" ? input.done || undefined : existing?.done,
  };
  await getRedis().hset(BOARD_KEY, { [id]: item });
  return listAdminBoard();
}
export async function deleteAdminBoard(id: string) {
  await getRedis().hdel(BOARD_KEY, id);
  return listAdminBoard();
}

/* ---------- trash: deleted links and folders, restorable for 30 days ---------- */
export interface TrashItem { id: string; kind: "link" | "folder"; at: string; by?: string; folderId?: string; folderName?: string; item: unknown; /** where a link sat in its folder */ index?: number }
const TRASH_KEY = "trash";
export async function addToTrash(items: Omit<TrashItem, "id" | "at">[]) {
  if (!items.length) return;
  const redis = getRedis();
  for (const t of items) await redis.lpush(TRASH_KEY, { ...t, id: uuid(), at: new Date().toISOString() });
  await redis.ltrim(TRASH_KEY, 0, 199);
}
export async function listTrash(): Promise<TrashItem[]> {
  const list = await getRedis().lrange<TrashItem>(TRASH_KEY, 0, 199);
  const month = Date.now() - 30 * 86400_000;
  return list.filter((t) => Date.parse(t.at) > month);
}
export async function takeFromTrash(id: string): Promise<TrashItem | null> {
  const list = await getRedis().lrange<TrashItem>(TRASH_KEY, 0, 199);
  const hit = list.find((t) => t.id === id) || null;
  if (hit) await getRedis().lrem(TRASH_KEY, 1, hit);
  return hit;
}
export async function emptyTrash() {
  await getRedis().del(TRASH_KEY);
}

/* ---------- last seen, including people who hide it from others ---------- */
export async function lastSeenRaw(): Promise<Record<string, number>> {
  const raw = ((await getRedis().hgetall<Record<string, number>>("lastseen")) || {}) as Record<string, number>;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
}

/* ---------- admin-only notes on links ---------- */
const LINK_NOTES_KEY = "adminlinknotes";
export async function adminLinkNotes(): Promise<Record<string, string>> {
  return ((await getRedis().hgetall<Record<string, string>>(LINK_NOTES_KEY)) || {}) as Record<string, string>;
}
export async function setAdminLinkNote(linkId: string, text: string) {
  if (!/^[\w-]{1,100}$/.test(linkId)) throw new Error("Invalid link");
  const t = text.trim().slice(0, 500);
  if (t) await getRedis().hset(LINK_NOTES_KEY, { [linkId]: t });
  else await getRedis().hdel(LINK_NOTES_KEY, linkId);
}
