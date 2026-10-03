import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { REV_KEYS, bumpRev, userRevKey } from "./revs";

// Per-account data that isn't shared with the class: profile, personal
// favourites, star ratings, private "My stuff" links, and the notifications
// inbox. One JSON blob per account keeps reads cheap.
export interface Profile {
  avatar?: string; // emoji
  color?: string;
  bio?: string;
}
export interface PrivateLink {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  kind: "mention" | "reply" | "suggestion" | "like" | "comment" | "dm" | "role" | "system";
  text: string;
  at: string;
  read?: boolean;
  from?: string;
}
/** Your own extras on a shared link — nobody else sees these. */
export interface LinkPref {
  note?: string; // private note
  later?: boolean; // read-later list
  done?: boolean; // ticked off
  rename?: string; // your own name for it
  hidden?: boolean; // hidden just for you
  checks?: number[]; // ticked checklist steps
}
export interface UserData {
  profile: Profile;
  favorites: string[]; // link ids
  ratings: Record<string, number>; // linkId -> 1..5
  myStuff: PrivateLink[];
  notifications: Notification[];
  links: Record<string, LinkPref>;
}

const EMPTY: UserData = { profile: {}, favorites: [], ratings: {}, myStuff: [], notifications: [], links: {} };
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
  return { ...EMPTY, ...(raw || {}), profile: raw?.profile || {}, links: raw?.links || {} };
}

async function save(username: string, data: UserData) {
  await getRedis().set(key(username), data);
  // lets the account's other tabs/devices know to refresh
  await bumpRev(userRevKey(username));
}

export async function getProfile(username: string): Promise<Profile> {
  return (await getUserData(username)).profile;
}

export async function setProfile(username: string, patch: Partial<Profile>) {
  const data = await getUserData(username);
  const p = data.profile;
  if (typeof patch.avatar === "string") p.avatar = patch.avatar.slice(0, 8);
  if (typeof patch.color === "string") p.color = patch.color.slice(0, 16);
  if (typeof patch.bio === "string") p.bio = patch.bio.slice(0, 200);
  await save(username, data);
  return p;
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

export async function addMyStuff(username: string, name: string, url: string): Promise<PrivateLink[]> {
  const data = await getUserData(username);
  data.myStuff = [{ id: uuid(), name: name.slice(0, 100), url, createdAt: new Date().toISOString() }, ...data.myStuff].slice(0, MAX_MYSTUFF);
  await save(username, data);
  return data.myStuff;
}

export async function removeMyStuff(username: string, id: string): Promise<PrivateLink[]> {
  const data = await getUserData(username);
  data.myStuff = data.myStuff.filter((l) => l.id !== id);
  await save(username, data);
  return data.myStuff;
}

export async function markNotificationsRead(username: string): Promise<void> {
  const data = await getUserData(username);
  data.notifications = data.notifications.map((n) => ({ ...n, read: true }));
  await save(username, data);
}

/** Push a notification to someone's inbox (deduped by a key per 30s burst). */
export async function notify(toUsername: string, n: Omit<Notification, "id" | "at" | "read">) {
  if (!toUsername) return;
  const data = await getUserData(toUsername);
  data.notifications = [
    { ...n, id: uuid(), at: new Date().toISOString(), read: false },
    ...data.notifications,
  ].slice(0, MAX_NOTIFS);
  await save(toUsername, data);
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
