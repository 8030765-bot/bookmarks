import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { REV_KEYS, bumpRev, userRevKey } from "./revs";
import { sendPush } from "./push";

// Per-account data that isn't shared with the class: profile, personal
// favourites, star ratings, private "My stuff" links, and the notifications
// inbox. One JSON blob per account keeps reads cheap.
export interface Profile {
  avatar?: string; // emoji
  color?: string;
  /** short write-up, simple formatting allowed */
  bio?: string;
  /** name shown instead of the username (the username still identifies you) */
  displayName?: string;
  /** "studying 📚" */
  status?: string;
  statusEmoji?: string;
  /** status clears itself after this (ISO) */
  statusUntil?: string;
  /** banner style on your profile */
  banner?: string;
  /** ring around your avatar */
  border?: string;
  /** topics you're into (tags) */
  into?: string[];
  /** up to 3 links you're showing off on your profile */
  showcase?: string[];
  /** who can see your profile */
  visibility?: "everyone" | "members" | "private";
  /** don't show when you're online or last active */
  hideOnline?: boolean;
}
export interface PrivateLink {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  /** which of your private folders it's in ("" = the main list) */
  folder?: string;
}
export interface Notification {
  id: string;
  kind: "mention" | "reply" | "suggestion" | "like" | "comment" | "dm" | "role" | "system" | "follow";
  text: string;
  at: string;
  read?: boolean;
  from?: string;
  /** where clicking it should take you, e.g. "/#link-abc" */
  link?: string;
}
export type NotifyKind = Notification["kind"];
/** Which kinds of notification you want (missing = yes). */
export type NotifyPrefs = Partial<Record<NotifyKind, boolean>>;
/** Your own extras on a shared link — nobody else sees these. */
export interface LinkPref {
  note?: string; // private note
  later?: boolean; // read-later list
  done?: boolean; // ticked off
  rename?: string; // your own name for it
  hidden?: boolean; // hidden just for you
  checks?: number[]; // ticked checklist steps
}
/** Your own settings for a shared folder. */
export interface FolderPref {
  hidden?: boolean; // hidden just for you
  fav?: boolean; // a favourite folder
  follow?: boolean; // get told about new links
  sort?: string; // your own order of links
}
/** A search + filters you saved to reopen in one click. */
export interface SavedView {
  id: string;
  name: string;
  q: string;
  tags: string[];
  tagMode: "any" | "all";
  sort?: string;
}
export interface UserData {
  profile: Profile;
  favorites: string[]; // link ids
  ratings: Record<string, number>; // linkId -> 1..5
  myStuff: PrivateLink[];
  notifications: Notification[];
  links: Record<string, LinkPref>;
  folders: Record<string, FolderPref>;
  /** your own arrangement of the folders (ids, top first) */
  folderOrder: string[];
  views: SavedView[];
  /** your look and layout, so they follow you to other devices */
  settings: Record<string, unknown>;
  /** people whose chat messages you don't want to see (lowercase) */
  blocked: string[];
  notifyPrefs: NotifyPrefs;
  /** do-not-disturb until (ISO): notifications still arrive, quietly */
  dndUntil?: string;
}

const EMPTY: UserData = { profile: {}, favorites: [], ratings: {}, myStuff: [], notifications: [], links: {}, folders: {}, folderOrder: [], views: [], settings: {}, blocked: [], notifyPrefs: {} };
const FOLDER_SORTS = ["manual", "name", "newest", "clicks", "rating", "mine"];

export async function setFolderPref(username: string, folderId: string, patch: Record<string, unknown>) {
  if (!/^[\w-]{1,100}$/.test(folderId)) throw new Error("Invalid folder");
  const data = await getUserData(username);
  const next: FolderPref = { ...(data.folders[folderId] || {}) };
  for (const k of ["hidden", "fav", "follow"] as const) if (typeof patch[k] === "boolean") next[k] = patch[k] as boolean;
  if (typeof patch.sort === "string") next.sort = FOLDER_SORTS.includes(patch.sort) ? patch.sort : undefined;
  (Object.keys(next) as (keyof FolderPref)[]).forEach((k) => { if (!next[k]) delete next[k]; });
  if (Object.keys(next).length) data.folders[folderId] = next;
  else delete data.folders[folderId];
  if (Object.keys(data.folders).length > 500) throw new Error("Too many folder settings");
  await save(username, data);
  return data.folders;
}

export async function setFolderOrder(username: string, order: unknown) {
  const data = await getUserData(username);
  data.folderOrder = Array.isArray(order) ? Array.from(new Set(order.map(String).filter((id) => /^[\w-]{1,100}$/.test(id)))).slice(0, 500) : [];
  await save(username, data);
  return data.folderOrder;
}

export async function saveView(username: string, v: Record<string, unknown>) {
  const data = await getUserData(username);
  const name = String(v.name || "").trim().slice(0, 40);
  if (!name) throw new Error("Give the view a name");
  const view: SavedView = {
    id: typeof v.id === "string" && /^[\w-]{1,40}$/.test(v.id) ? v.id : uuid(),
    name,
    q: String(v.q || "").slice(0, 200),
    tags: Array.isArray(v.tags) ? v.tags.map(String).slice(0, 10) : [],
    tagMode: v.tagMode === "all" ? "all" : "any",
    sort: typeof v.sort === "string" ? v.sort.slice(0, 20) : undefined,
  };
  data.views = [view, ...data.views.filter((x) => x.id !== view.id)].slice(0, 20);
  await save(username, data);
  return data.views;
}

export async function deleteView(username: string, id: string) {
  const data = await getUserData(username);
  data.views = data.views.filter((x) => x.id !== id);
  await save(username, data);
  return data.views;
}
const MAX_LINK_PREFS = 2000;

/** Keep only well-formed fields; drop the entry entirely when it's empty. */
export function cleanLinkPref(p: Record<string, unknown>): LinkPref | null {
  const out: LinkPref = {};
  if (typeof p.note === "string" && p.note.trim()) out.note = p.note.trim().slice(0, 500);
  if (p.later === true) out.later = true;
  if (p.done === true) out.done = true;
  if (typeof p.rename === "string" && p.rename.trim()) out.rename = p.rename.trim().slice(0, 100);
  if (p.hidden === true) out.hidden = true;
  if (Array.isArray(p.checks)) {
    const checks = Array.from(new Set(p.checks.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < 12))).sort((a, b) => a - b);
    if (checks.length) out.checks = checks;
  }
  return Object.keys(out).length ? out : null;
}

export async function setLinkPref(username: string, linkId: string, patch: Record<string, unknown>) {
  if (!/^[\w-]{1,100}$/.test(linkId)) throw new Error("Invalid link");
  const data = await getUserData(username);
  const merged = cleanLinkPref({ ...(data.links[linkId] || {}), ...patch });
  if (merged) data.links[linkId] = merged;
  else delete data.links[linkId];
  const ids = Object.keys(data.links);
  if (ids.length > MAX_LINK_PREFS) throw new Error("That's a lot of notes — remove some first");
  await save(username, data);
  return data.links;
}
const key = (username: string) => `userdata:${username.toLowerCase()}`;
const MAX_NOTIFS = 50;
const MAX_MYSTUFF = 200;

function getRedis() {
  return Redis.fromEnv();
}

export async function getUserData(username: string): Promise<UserData> {
  const raw = await getRedis().get<UserData>(key(username));
  return {
    ...EMPTY, ...(raw || {}),
    profile: raw?.profile || {}, links: raw?.links || {}, folders: raw?.folders || {}, folderOrder: raw?.folderOrder || [], views: raw?.views || [],
    settings: raw?.settings || {}, blocked: raw?.blocked || [], notifyPrefs: raw?.notifyPrefs || {},
  };
}

async function save(username: string, data: UserData) {
  await getRedis().set(key(username), data);
  // lets the account's other tabs/devices know to refresh
  await bumpRev(userRevKey(username));
}

export async function getProfile(username: string): Promise<Profile> {
  return (await getUserData(username)).profile;
}

const BANNERS = ["none", "sunset", "ocean", "forest", "candy", "night", "gold"];
const BORDERS = ["none", "ring", "glow", "double", "dashed"];
export async function setProfile(username: string, patch: Partial<Profile>) {
  const data = await getUserData(username);
  const p = data.profile;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined);
  if (typeof patch.avatar === "string") p.avatar = patch.avatar.slice(0, 8);
  if (typeof patch.color === "string") p.color = /^#[0-9a-f]{3,8}$/i.test(patch.color) ? patch.color : undefined;
  if (typeof patch.bio === "string") p.bio = text(patch.bio, 500);
  if (typeof patch.displayName === "string") p.displayName = text(patch.displayName.replace(/[\u0000-\u001f]/g, ""), 30);
  if (typeof patch.status === "string") p.status = text(patch.status, 60);
  if (typeof patch.statusEmoji === "string") p.statusEmoji = text(patch.statusEmoji, 8);
  if (typeof patch.statusUntil === "string") {
    const t = Date.parse(patch.statusUntil);
    p.statusUntil = patch.statusUntil && Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  }
  if (typeof patch.banner === "string") p.banner = BANNERS.includes(patch.banner) && patch.banner !== "none" ? patch.banner : undefined;
  if (typeof patch.border === "string") p.border = BORDERS.includes(patch.border) && patch.border !== "none" ? patch.border : undefined;
  if (Array.isArray(patch.into)) {
    const into = Array.from(new Set(patch.into.map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").slice(0, 24)).filter(Boolean))).slice(0, 5);
    p.into = into.length ? into : undefined;
  }
  if (Array.isArray(patch.showcase)) {
    const ids = patch.showcase.map(String).filter((id) => /^[\w-]{1,100}$/.test(id)).slice(0, 3);
    p.showcase = ids.length ? ids : undefined;
  }
  if (typeof patch.visibility === "string") p.visibility = ["members", "private"].includes(patch.visibility) ? patch.visibility : undefined;
  if (typeof patch.hideOnline === "boolean") p.hideOnline = patch.hideOnline || undefined;
  (Object.keys(p) as (keyof Profile)[]).forEach((k) => { if (p[k] === undefined) delete p[k]; });
  await save(username, data);
  return p;
}

/** A status that has run out shouldn't show any more. */
export function liveProfile(p: Profile): Profile {
  if (p.statusUntil && Date.parse(p.statusUntil) < Date.now()) {
    const { status: _s, statusEmoji: _e, statusUntil: _u, ...rest } = p;
    return rest;
  }
  return p;
}

/* ---------- settings that follow you between devices ---------- */
const SETTING_KEYS = ["look", "view", "sort", "collapsed", "quickTab", "showTags", "space", "folderViews", "startView", "sync"];
export async function saveSettings(username: string, patch: Record<string, unknown>) {
  const data = await getUserData(username);
  for (const k of SETTING_KEYS) if (k in patch) data.settings[k] = patch[k];
  if (JSON.stringify(data.settings).length > 20_000) throw new Error("Those settings are too big to save");
  await save(username, data);
  return data.settings;
}

export async function setBlocked(username: string, target: string, block: boolean) {
  const data = await getUserData(username);
  const t = target.toLowerCase();
  if (t === username.toLowerCase()) throw new Error("You can't block yourself");
  const set = new Set(data.blocked);
  if (block) set.add(t); else set.delete(t);
  data.blocked = Array.from(set).slice(0, 200);
  await save(username, data);
  return data.blocked;
}

/* ---------- My Stuff folders ---------- */
export async function moveMyStuff(username: string, id: string, folder: string) {
  const data = await getUserData(username);
  data.myStuff = data.myStuff.map((l) => (l.id === id ? { ...l, folder: folder.trim().slice(0, 40) || undefined } : l));
  await save(username, data);
  return data.myStuff;
}
export async function renameMyStuffFolder(username: string, from: string, to: string) {
  const data = await getUserData(username);
  const name = to.trim().slice(0, 40);
  data.myStuff = data.myStuff.map((l) => ((l.folder || "") === from ? { ...l, folder: name || undefined } : l));
  await save(username, data);
  return data.myStuff;
}
export async function importMyStuff(username: string, items: { name: string; url: string; folder?: string }[]) {
  const data = await getUserData(username);
  const have = new Set(data.myStuff.map((l) => l.url));
  const added: PrivateLink[] = [];
  for (const it of items) {
    if (have.has(it.url) || data.myStuff.length + added.length >= MAX_MYSTUFF) continue;
    have.add(it.url);
    added.push({ id: uuid(), name: it.name.slice(0, 100), url: it.url, createdAt: new Date().toISOString(), folder: it.folder?.slice(0, 40) || undefined });
  }
  data.myStuff = [...added, ...data.myStuff];
  await save(username, data);
  return { myStuff: data.myStuff, added: added.length };
}

/** Move a whole account's data to a new username. */
export async function renameUserData(oldName: string, newName: string) {
  if (oldName.toLowerCase() === newName.toLowerCase()) return;
  const redis = getRedis();
  const raw = await redis.get(key(oldName));
  if (raw) await redis.set(key(newName), raw);
  await redis.del(key(oldName), userRevKey(oldName));
}
export async function deleteUserData(username: string) {
  await getRedis().del(key(username), userRevKey(username));
}

export async function toggleFavorite(username: string, linkId: string): Promise<string[]> {
  const data = await getUserData(username);
  const set = new Set(data.favorites);
  if (set.has(linkId)) set.delete(linkId);
  else set.add(linkId);
  data.favorites = Array.from(set);
  await save(username, data);
  return data.favorites;
}

export async function setRating(username: string, linkId: string, stars: number): Promise<Record<string, number>> {
  const data = await getUserData(username);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) delete data.ratings[linkId];
  else data.ratings[linkId] = stars;
  await save(username, data);
  return data.ratings;
}

export async function addMyStuff(username: string, name: string, url: string, folder?: string): Promise<PrivateLink[]> {
  const data = await getUserData(username);
  data.myStuff = [{ id: uuid(), name: name.slice(0, 100), url, createdAt: new Date().toISOString(), folder: folder?.trim().slice(0, 40) || undefined }, ...data.myStuff].slice(0, MAX_MYSTUFF);
  await save(username, data);
  return data.myStuff;
}

export async function removeMyStuff(username: string, id: string): Promise<PrivateLink[]> {
  const data = await getUserData(username);
  data.myStuff = data.myStuff.filter((l) => l.id !== id);
  await save(username, data);
  return data.myStuff;
}

export async function markNotificationsRead(username: string, id?: string): Promise<Notification[]> {
  const data = await getUserData(username);
  data.notifications = data.notifications.map((n) => (!id || n.id === id ? { ...n, read: true } : n));
  await save(username, data);
  return data.notifications;
}
export async function clearNotifications(username: string, id?: string): Promise<Notification[]> {
  const data = await getUserData(username);
  data.notifications = id ? data.notifications.filter((n) => n.id !== id) : [];
  await save(username, data);
  return data.notifications;
}
const KINDS: NotifyKind[] = ["mention", "reply", "suggestion", "like", "comment", "dm", "role", "system", "follow"];
export async function setNotifyPrefs(username: string, patch: Record<string, unknown>) {
  const data = await getUserData(username);
  for (const k of KINDS) if (typeof patch[k] === "boolean") data.notifyPrefs[k] = patch[k] as boolean;
  await save(username, data);
  return data.notifyPrefs;
}
export async function setDnd(username: string, until: string | null) {
  const data = await getUserData(username);
  const t = until ? Date.parse(until) : NaN;
  data.dndUntil = Number.isFinite(t) && t > Date.now() ? new Date(t).toISOString() : undefined;
  await save(username, data);
  return data.dndUntil || null;
}

const PUSH_TITLES: Partial<Record<NotifyKind, string>> = {
  mention: "You were mentioned", reply: "New reply", like: "Someone liked your link", follow: "New in something you follow",
  suggestion: "Your suggestion", role: "Your role changed", system: "Theo's Bookmarks",
};
/** Add a notification to someone's inbox (unless they turned that kind off) and push it to their devices. */
export async function notify(toUsername: string, n: Omit<Notification, "id" | "at" | "read">) {
  if (!toUsername) return;
  const data = await getUserData(toUsername);
  if (data.notifyPrefs[n.kind] === false) return;
  const entry: Notification = { ...n, id: uuid(), at: new Date().toISOString(), read: false };
  data.notifications = [entry, ...data.notifications].slice(0, MAX_NOTIFS);
  await save(toUsername, data);
  const quiet = data.dndUntil && Date.parse(data.dndUntil) > Date.now();
  if (!quiet) {
    await sendPush(toUsername, { title: PUSH_TITLES[n.kind] || "Theo's Bookmarks", body: n.text.slice(0, 160), url: n.link || "/", tag: n.kind }).catch(() => {});
  }
}

/* ---------- aggregate star ratings (public) ---------- */
// Stored separately so everyone can see averages without reading every user blob.
// hash: linkId -> "sum,count,n1,n2,n3,n4,n5" (older entries only have "sum,count")
const RATINGS_KEY = "ratings:agg";
export async function recordAggregateRating(linkId: string, oldStars: number | undefined, newStars: number | undefined) {
  const redis = getRedis();
  const raw = (await redis.hget<string>(RATINGS_KEY, linkId)) || "0,0";
  const parts = String(raw).split(",").map(Number);
  let [sum, count] = parts;
  const hist = [1, 2, 3, 4, 5].map((_, i) => parts[i + 2] || 0);
  if (oldStars) { sum -= oldStars; count -= 1; hist[oldStars - 1] = Math.max(0, hist[oldStars - 1] - 1); }
  if (newStars) { sum += newStars; count += 1; hist[newStars - 1] += 1; }
  if (count <= 0) await redis.hdel(RATINGS_KEY, linkId);
  else await redis.hset(RATINGS_KEY, { [linkId]: [sum, count, ...hist].join(",") });
  await bumpRev(REV_KEYS.ratings);
}

export interface RatingAgg { avg: number; count: number; hist: number[] }
export async function getAggregateRatings(): Promise<Record<string, RatingAgg>> {
  const raw = (await getRedis().hgetall<Record<string, string>>(RATINGS_KEY)) || {};
  const out: Record<string, RatingAgg> = {};
  for (const [linkId, v] of Object.entries(raw)) {
    const parts = String(v).split(",").map(Number);
    const [sum, count] = parts;
    if (count > 0) out[linkId] = { avg: Math.round((sum / count) * 10) / 10, count, hist: [1, 2, 3, 4, 5].map((_, i) => parts[i + 2] || 0) };
  }
  return out;
}
