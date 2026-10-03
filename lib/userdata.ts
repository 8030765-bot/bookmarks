import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";

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
export interface UserData {
  profile: Profile;
  favorites: string[]; // link ids
  ratings: Record<string, number>; // linkId -> 1..5
  myStuff: PrivateLink[];
  notifications: Notification[];
}

const EMPTY: UserData = { profile: {}, favorites: [], ratings: {}, myStuff: [], notifications: [] };
const key = (username: string) => `userdata:${username.toLowerCase()}`;
const MAX_NOTIFS = 50;
const MAX_MYSTUFF = 200;

function getRedis() {
  return Redis.fromEnv();
}

export async function getUserData(username: string): Promise<UserData> {
  const raw = await getRedis().get<UserData>(key(username));
  return { ...EMPTY, ...(raw || {}), profile: raw?.profile || {} };
}

async function save(username: string, data: UserData) {
  await getRedis().set(key(username), data);
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
const RATINGS_KEY = "ratings:agg"; // hash: linkId -> "sum,count"
export async function recordAggregateRating(linkId: string, oldStars: number | undefined, newStars: number | undefined) {
  const redis = getRedis();
  const raw = (await redis.hget<string>(RATINGS_KEY, linkId)) || "0,0";
  let [sum, count] = raw.split(",").map(Number);
  if (oldStars) { sum -= oldStars; count -= 1; }
  if (newStars) { sum += newStars; count += 1; }
  if (count <= 0) await redis.hdel(RATINGS_KEY, linkId);
  else await redis.hset(RATINGS_KEY, { [linkId]: `${sum},${count}` });
}

export interface RatingAgg { avg: number; count: number }
export async function getAggregateRatings(): Promise<Record<string, RatingAgg>> {
  const raw = (await getRedis().hgetall<Record<string, string>>(RATINGS_KEY)) || {};
  const out: Record<string, RatingAgg> = {};
  for (const [linkId, v] of Object.entries(raw)) {
    const [sum, count] = String(v).split(",").map(Number);
    if (count > 0) out[linkId] = { avg: Math.round((sum / count) * 10) / 10, count };
  }
  return out;
}
