import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { REV_KEYS, bumpRev, userRevKey } from "./revs";
import { sendPush } from "./push";
import { QuietHours, cleanQuietHours, inQuietHours } from "./quiet";

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
  /** a theme code (from Customize → Share) shown on your profile */
  themeCode?: string;
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
  /** who sees when you were last online: everyone (missing) or only people you follow */
  lastSeenTo?: "friends";
  /** set by hand: "away" or "busy" (missing = automatic) */
  availability?: "away" | "busy";
  /** badges you picked to show off (ids from lib/badges) */
  badges?: string[];
  /** "MM-DD", no year */
  birthday?: string;
  /* pictures: image ids from lib/images — only lib/pictures changes these */
  pic?: string;
  /** the moving version when your picture is a GIF (pic is its still frame) */
  picGif?: string;
  picPending?: string;
  bannerPic?: string;
  bannerPending?: string;
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
  kind: "mention" | "reply" | "suggestion" | "like" | "comment" | "dm" | "role" | "system" | "follow" | "share";
  text: string;
  at: string;
  read?: boolean;
  from?: string;
  /** where clicking it should take you, e.g. "/#link-abc" */
  link?: string;
  /** hidden until then, when it comes back as unread (ISO) */
  snoozeUntil?: string;
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
  note?: string; // a private sticky note on the folder
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
  /** chat messages you saved for later */
  savedMessages: SavedMessage[];
  /** when you agreed to the site rules */
  rulesAcceptedAt?: string;
  /** every day, no pop-ups, sounds or phone alerts between these times */
  quietHours?: QuietHours;
  /** My Stuff folders anyone logged in can see at /u/name/list/folder */
  publicLists?: string[];
}
export interface SavedMessage { id: string; channel: string; user: string; text: string; at: string; savedAt: string }

const EMPTY: UserData = { profile: {}, favorites: [], ratings: {}, myStuff: [], notifications: [], links: {}, folders: {}, folderOrder: [], views: [], settings: {}, blocked: [], notifyPrefs: {}, savedMessages: [] };
const FOLDER_SORTS = ["manual", "name", "newest", "clicks", "rating", "mine"];

export async function setFolderPref(username: string, folderId: string, patch: Record<string, unknown>) {
  if (!/^[\w-]{1,100}$/.test(folderId)) throw new Error("Invalid folder");
  const data = await getUserData(username);
  const next: FolderPref = { ...(data.folders[folderId] || {}) };
  for (const k of ["hidden", "fav", "follow"] as const) if (typeof patch[k] === "boolean") next[k] = patch[k] as boolean;
  if (typeof patch.sort === "string") next.sort = FOLDER_SORTS.includes(patch.sort) ? patch.sort : undefined;
  if (typeof patch.note === "string") next.note = patch.note.trim().slice(0, 500) || undefined;
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
    settings: raw?.settings || {}, blocked: raw?.blocked || [], notifyPrefs: raw?.notifyPrefs || {}, savedMessages: raw?.savedMessages || [],
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
  if (typeof patch.themeCode === "string") p.themeCode = /^TB1\.[A-Za-z0-9_-]{2,600}$/.test(patch.themeCode) ? patch.themeCode : undefined;
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
  if (typeof patch.lastSeenTo === "string") p.lastSeenTo = patch.lastSeenTo === "friends" ? "friends" : undefined;
  if (typeof patch.availability === "string") p.availability = patch.availability === "away" || patch.availability === "busy" ? patch.availability : undefined;
  if (Array.isArray(patch.badges)) {
    const ids = Array.from(new Set(patch.badges.map(String).filter((id) => /^[a-z0-9-]{1,30}$/.test(id)))).slice(0, 3);
    p.badges = ids.length ? ids : undefined;
  }
  if (typeof patch.birthday === "string") {
    const m = /^(\d\d)-(\d\d)$/.exec(patch.birthday);
    p.birthday = m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? patch.birthday : undefined;
  }
  (Object.keys(p) as (keyof Profile)[]).forEach((k) => { if (p[k] === undefined) delete p[k]; });
  await save(username, data);
  await bumpRev(REV_KEYS.faces);
  return p;
}

type PictureFields = Pick<Profile, "pic" | "picGif" | "picPending" | "bannerPic" | "bannerPending">;
/** Pictures are set only after checks (see lib/pictures), never straight from a request. */
export async function setPictureFields(username: string, patch: Partial<PictureFields>) {
  const data = await getUserData(username);
  const p = data.profile;
  for (const [k, v] of Object.entries(patch) as [keyof PictureFields, string | undefined][]) {
    if (v) p[k] = v; else delete p[k];
  }
  await save(username, data);
  await bumpRev(REV_KEYS.faces);
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

export async function saveMessage(username: string, m: Record<string, unknown>, on: boolean) {
  const data = await getUserData(username);
  const id = String(m.id || "");
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error("Invalid message");
  data.savedMessages = data.savedMessages.filter((x) => x.id !== id);
  if (on) {
    data.savedMessages.unshift({
      id, channel: String(m.channel || "general").slice(0, 40), user: String(m.user || "").slice(0, 20),
      text: String(m.text || "").slice(0, 500), at: String(m.at || ""), savedAt: new Date().toISOString(),
    });
  }
  data.savedMessages = data.savedMessages.slice(0, 50);
  await save(username, data);
  return data.savedMessages;
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

/**
 * Bring back your own settings from a "Download my data" file: look and
 * layout, notes on links, folder settings, saved views, favourites, blocked
 * people and My Stuff. Everything is checked like a normal change.
 */
export async function importPersonal(username: string, file: Record<string, unknown>) {
  if (JSON.stringify(file).length > 400_000) throw new Error("That file is too big");
  const data = await getUserData(username);
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const counts = { settings: 0, notes: 0, folders: 0, views: 0, favorites: 0, myStuff: 0 };
  const settings = obj(file.settings);
  if (settings) for (const k of SETTING_KEYS) if (k in settings) { data.settings[k] = settings[k]; counts.settings++; }
  for (const [id, p] of Object.entries(obj(file.linkNotes) || {}).slice(0, MAX_LINK_PREFS)) {
    if (!/^[\w-]{1,100}$/.test(id) || !obj(p)) continue;
    const c = cleanLinkPref({ ...(data.links[id] || {}), ...(p as Record<string, unknown>) });
    if (c) { data.links[id] = c; counts.notes++; }
  }
  for (const [id, p] of Object.entries(obj(file.folderSettings) || {}).slice(0, 500)) {
    const q = obj(p);
    if (!/^[\w-]{1,100}$/.test(id) || !q) continue;
    const next: FolderPref = {};
    for (const k of ["hidden", "fav", "follow"] as const) if (q[k] === true) next[k] = true;
    if (typeof q.sort === "string" && FOLDER_SORTS.includes(q.sort)) next.sort = q.sort;
    if (typeof q.note === "string" && q.note.trim()) next.note = q.note.trim().slice(0, 500);
    if (Object.keys(next).length) { data.folders[id] = next; counts.folders++; }
  }
  if (Array.isArray(file.folderOrder)) data.folderOrder = Array.from(new Set(file.folderOrder.map(String).filter((id) => /^[\w-]{1,100}$/.test(id)))).slice(0, 500);
  if (Array.isArray(file.savedViews)) {
    for (const v of file.savedViews.slice(0, 20)) {
      const q = obj(v);
      const name = typeof q?.name === "string" ? q.name.trim().slice(0, 40) : "";
      if (!q || !name || data.views.some((x) => x.name === name) || data.views.length >= 20) continue;
      data.views.push({
        id: uuid(), name, q: typeof q.q === "string" ? q.q.slice(0, 200) : "",
        tags: Array.isArray(q.tags) ? q.tags.map(String).slice(0, 10) : [], tagMode: q.tagMode === "all" ? "all" : "any",
        sort: typeof q.sort === "string" ? q.sort.slice(0, 20) : undefined,
      });
      counts.views++;
    }
  }
  if (Array.isArray(file.favorites)) {
    const ids = file.favorites.map(String).filter((id) => /^[\w-]{1,100}$/.test(id));
    const before = data.favorites.length;
    data.favorites = Array.from(new Set([...data.favorites, ...ids])).slice(0, 1000);
    counts.favorites = data.favorites.length - before;
  }
  if (Array.isArray(file.blocked)) data.blocked = Array.from(new Set([...data.blocked, ...file.blocked.map((u) => String(u).toLowerCase()).filter((u) => /^[a-z0-9_]{3,20}$/.test(u))])).slice(0, 200);
  if (Array.isArray(file.myStuff)) {
    const have = new Set(data.myStuff.map((l) => l.url));
    for (const it of file.myStuff) {
      const q = obj(it);
      const url = typeof q?.url === "string" ? q.url : "";
      if (!/^https?:\/\//i.test(url) || have.has(url) || data.myStuff.length >= MAX_MYSTUFF) continue;
      have.add(url);
      data.myStuff.push({ id: uuid(), name: String(q!.name || url).slice(0, 100), url: url.slice(0, 2000), createdAt: new Date().toISOString(), folder: typeof q!.folder === "string" ? q!.folder.slice(0, 40) || undefined : undefined });
      counts.myStuff++;
    }
  }
  if (JSON.stringify(data.settings).length > 20_000) throw new Error("Those settings are too big to save");
  await save(username, data);
  return counts;
}

export async function setRulesAccepted(username: string) {
  const data = await getUserData(username);
  data.rulesAcceptedAt = new Date().toISOString();
  await save(username, data);
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
/** "Undo" after clearing notifications: put them back (your own inbox only, so nothing new can be made up). */
export async function restoreNotifications(username: string, list: unknown) {
  const data = await getUserData(username);
  const have = new Set(data.notifications.map((n) => n.id));
  const kinds = new Set<string>(["mention", "reply", "suggestion", "like", "comment", "dm", "role", "system", "follow", "share"]);
  const back: Notification[] = [];
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_NOTIFS) as Record<string, unknown>[]) {
    const id = String(raw?.id || "");
    if (!/^[\w-]{1,64}$/.test(id) || have.has(id) || !kinds.has(String(raw.kind)) || !Number.isFinite(Date.parse(String(raw.at)))) continue;
    back.push({
      id, kind: raw.kind as NotifyKind, text: String(raw.text || "").slice(0, 300), at: new Date(String(raw.at)).toISOString(), read: raw.read === true,
      from: typeof raw.from === "string" ? raw.from.slice(0, 20) : undefined, link: typeof raw.link === "string" && raw.link.startsWith("/") ? raw.link.slice(0, 200) : undefined,
    });
  }
  data.notifications = [...data.notifications, ...back].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_NOTIFS);
  await save(username, data);
  return data.notifications;
}
const KINDS: NotifyKind[] = ["mention", "reply", "suggestion", "like", "comment", "dm", "role", "system", "follow", "share"];
export async function setNotifyPrefs(username: string, patch: Record<string, unknown>) {
  const data = await getUserData(username);
  for (const k of KINDS) if (typeof patch[k] === "boolean") data.notifyPrefs[k] = patch[k] as boolean;
  await save(username, data);
  return data.notifyPrefs;
}
/** Share one of your My Stuff folders with everyone who's logged in (or stop sharing it). */
export async function setPublicList(username: string, name: unknown, on: boolean) {
  const data = await getUserData(username);
  const list = String(name || "").trim().slice(0, 40);
  if (!list) throw new Error("Put the links in a named folder first, then share that folder");
  if (on && !data.myStuff.some((l) => (l.folder || "") === list)) throw new Error("That folder is empty");
  const set = new Set(data.publicLists || []);
  if (on) set.add(list); else set.delete(list);
  data.publicLists = Array.from(set).slice(0, 10);
  if (!data.publicLists.length) delete data.publicLists;
  await save(username, data);
  return data.publicLists || [];
}
/** A shared My Stuff folder, or null if it isn't shared. */
export async function getPublicList(username: string, name: string) {
  const data = await getUserData(username);
  if (!data.publicLists?.includes(name)) return null;
  return data.myStuff.filter((l) => (l.folder || "") === name).map((l) => ({ id: l.id, name: l.name, url: l.url }));
}
export async function setQuietHours(username: string, q: unknown) {
  const data = await getUserData(username);
  data.quietHours = cleanQuietHours(q);
  await save(username, data);
  return data.quietHours || null;
}
/** "Remind me later": hide a notification until then; it comes back unread. */
export async function snoozeNotification(username: string, id: string, until: string) {
  const t = Date.parse(until);
  if (!Number.isFinite(t) || t <= Date.now() || t > Date.now() + 7 * 86400_000) throw new Error("Pick a time in the next week");
  const data = await getUserData(username);
  if (!data.notifications.some((n) => n.id === id)) throw new Error("That notification is gone");
  data.notifications = data.notifications.map((n) => (n.id === id ? { ...n, snoozeUntil: new Date(t).toISOString(), read: false } : n));
  await save(username, data);
  return data.notifications;
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
  suggestion: "Your suggestion", role: "Your role changed", system: "Theo's Bookmarks", share: "A website for you",
};
/** Add a notification to someone's inbox (unless they turned that kind off) and push it to their devices. */
export async function notify(toUsername: string, n: Omit<Notification, "id" | "at" | "read">) {
  if (!toUsername) return;
  const data = await getUserData(toUsername);
  if (data.notifyPrefs[n.kind] === false) return;
  const entry: Notification = { ...n, id: uuid(), at: new Date().toISOString(), read: false };
  // old ones clear themselves: read ones after 30 days, everything after 90
  const now = Date.now();
  const keep = (x: Notification) => now - Date.parse(x.at) < (x.read ? 30 : 90) * 86400_000;
  data.notifications = [entry, ...data.notifications.filter(keep)].slice(0, MAX_NOTIFS);
  await save(toUsername, data);
  // "busy" on your profile keeps things quiet too
  const quiet = (data.dndUntil && Date.parse(data.dndUntil) > Date.now()) || data.profile.availability === "busy" || inQuietHours(data.quietHours);
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
