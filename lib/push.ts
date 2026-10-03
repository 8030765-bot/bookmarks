import webpush from "web-push";
import { Redis } from "@upstash/redis";

/**
 * Browser push notifications. Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
 * (run `npm run vapid` once and put the two keys in Vercel's environment
 * variables). Without them push is simply switched off.
 */
const subsKey = (u: string) => `push:${u.toLowerCase()}`;
const MAX_SUBS = 10;

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

let ready = false;
function setup() {
  if (ready || !pushConfigured()) return ready;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  ready = true;
  return ready;
}

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

function cleanSub(raw: unknown): PushSub | null {
  const s = raw as PushSub;
  if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  if (typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } };
}

export async function addPushSub(username: string, raw: unknown) {
  const sub = cleanSub(raw);
  if (!sub) throw new Error("That browser didn't give a valid push subscription");
  const redis = Redis.fromEnv();
  const subs = ((await redis.get<PushSub[]>(subsKey(username))) || []).filter((s) => s.endpoint !== sub.endpoint);
  await redis.set(subsKey(username), [sub, ...subs].slice(0, MAX_SUBS));
}

export async function removePushSub(username: string, endpoint: string) {
  const redis = Redis.fromEnv();
  const subs = (await redis.get<PushSub[]>(subsKey(username))) || [];
  await redis.set(subsKey(username), subs.filter((s) => s.endpoint !== endpoint));
}

export async function hasPush(username: string) {
  return ((await Redis.fromEnv().get<PushSub[]>(subsKey(username))) || []).length > 0;
}

/** Send to every browser the person turned push on in; forget ones that have gone away. */
export async function sendPush(username: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!setup()) return;
  const redis = Redis.fromEnv();
  const subs = (await redis.get<PushSub[]>(subsKey(username))) || [];
  if (!subs.length) return;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.endpoint);
    }
  }));
  if (dead.length) await redis.set(subsKey(username), subs.filter((s) => !dead.includes(s.endpoint)));
}

export async function deletePushSubs(username: string) {
  await Redis.fromEnv().del(subsKey(username));
}
