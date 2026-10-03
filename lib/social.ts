import { Redis } from "@upstash/redis";
import { notify } from "./userdata";

/**
 * Following people, kudos, and "last seen". Kept in small sets/hashes so
 * profile pages can read counts without opening every account.
 */
export const followingKey = (u: string) => `following:${u.toLowerCase()}`;
export const fansKey = (u: string) => `fans:${u.toLowerCase()}`;
const KUDOS_KEY = "kudos"; // hash: username -> count
const LAST_SEEN_KEY = "lastseen"; // hash: username -> ms
export const HIDE_ONLINE_KEY = "hideonline"; // set of usernames who hide their online status
const KUDOS_PER_DAY = 3;

function getRedis() {
  return Redis.fromEnv();
}

export async function follow(me: string, target: string, on: boolean) {
  const a = me.toLowerCase();
  const b = target.toLowerCase();
  if (a === b) throw new Error("You can't follow yourself");
  const redis = getRedis();
  if (on) {
    const added = await redis.sadd(followingKey(a), b);
    await redis.sadd(fansKey(b), a);
    if (added) notify(target, { kind: "follow", from: me, text: `${me} started following you` }).catch(() => {});
  } else {
    await redis.srem(followingKey(a), b);
    await redis.srem(fansKey(b), a);
  }
}

export async function getFollowing(u: string): Promise<string[]> {
  return getRedis().smembers(followingKey(u));
}

export async function socialCounts(u: string, viewer?: string | null) {
  const redis = getRedis();
  const [following, fans, kudos] = await Promise.all([
    redis.smembers(followingKey(u)),
    redis.smembers(fansKey(u)),
    redis.hget<number>(KUDOS_KEY, u.toLowerCase()),
  ]);
  const v = viewer?.toLowerCase();
  const mine = v && v !== u.toLowerCase() ? await redis.smembers(followingKey(v)) : [];
  const fanSet = new Set(fans);
  return {
    following: following.length,
    followers: fans.length,
    kudos: Number(kudos || 0),
    youFollow: !!v && fanSet.has(v),
    followsYou: !!v && following.includes(v),
    // people you both follow
    mutual: mine.filter((x) => following.includes(x)).slice(0, 10),
  };
}

/** A kudos star: up to three a day per person, never to yourself. */
export async function giveKudos(me: string, target: string) {
  if (me.toLowerCase() === target.toLowerCase()) throw new Error("You can't give yourself kudos");
  const redis = getRedis();
  const day = new Date().toISOString().slice(0, 10);
  const key = `kudosgiven:${me.toLowerCase()}:${day}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 2 * 86400);
  if (n > KUDOS_PER_DAY) throw new Error(`You can give ${KUDOS_PER_DAY} kudos a day — try again tomorrow`);
  const total = await redis.hincrby(KUDOS_KEY, target.toLowerCase(), 1);
  notify(target, { kind: "like", from: me, text: `${me} gave you a kudos star ⭐` }).catch(() => {});
  return { total, left: KUDOS_PER_DAY - n };
}

export async function kudosAll(): Promise<Record<string, number>> {
  const raw = (await getRedis().hgetall<Record<string, number>>(KUDOS_KEY)) || {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)]));
}

/* ---------- last seen ---------- */
export async function touchLastSeen(u: string) {
  await getRedis().hset(LAST_SEEN_KEY, { [u.toLowerCase()]: Date.now() });
}
export async function lastSeenAll(): Promise<Record<string, number>> {
  const redis = getRedis();
  const [raw, hidden] = await Promise.all([redis.hgetall<Record<string, number>>(LAST_SEEN_KEY), redis.smembers(HIDE_ONLINE_KEY)]);
  const hide = new Set(hidden);
  return Object.fromEntries(Object.entries(raw || {}).filter(([k]) => !hide.has(k)).map(([k, v]) => [k, Number(v)]));
}
export async function setHideOnline(u: string, hide: boolean) {
  const redis = getRedis();
  if (hide) await redis.sadd(HIDE_ONLINE_KEY, u.toLowerCase());
  else await redis.srem(HIDE_ONLINE_KEY, u.toLowerCase());
}

/** Rename support: move someone's follows to their new name. */
export async function renameSocial(oldName: string, newName: string) {
  const redis = getRedis();
  const a = oldName.toLowerCase();
  const b = newName.toLowerCase();
  if (a === b) return;
  const [following, fans] = await Promise.all([redis.smembers(followingKey(a)), redis.smembers(fansKey(a))]);
  for (const f of following) { await redis.srem(fansKey(f), a); await redis.sadd(fansKey(f), b); }
  for (const f of fans) { await redis.srem(followingKey(f), a); await redis.sadd(followingKey(f), b); }
  if (following.length) await redis.sadd(followingKey(b), following[0], ...following.slice(1));
  if (fans.length) await redis.sadd(fansKey(b), fans[0], ...fans.slice(1));
  await redis.del(followingKey(a), fansKey(a));
  const kudos = await redis.hget<number>(KUDOS_KEY, a);
  if (kudos) { await redis.hset(KUDOS_KEY, { [b]: kudos }); await redis.hdel(KUDOS_KEY, a); }
  await redis.hdel(LAST_SEEN_KEY, a);
  if (await redis.sismember(HIDE_ONLINE_KEY, a)) { await redis.srem(HIDE_ONLINE_KEY, a); await redis.sadd(HIDE_ONLINE_KEY, b); }
}

/** Account deletion: forget someone's social traces. */
export async function deleteSocial(u: string) {
  const redis = getRedis();
  const a = u.toLowerCase();
  const [following, fans] = await Promise.all([redis.smembers(followingKey(a)), redis.smembers(fansKey(a))]);
  for (const f of following) await redis.srem(fansKey(f), a);
  for (const f of fans) await redis.srem(followingKey(f), a);
  await redis.del(followingKey(a), fansKey(a));
  await redis.hdel(KUDOS_KEY, a);
  await redis.hdel(LAST_SEEN_KEY, a);
  await redis.srem(HIDE_ONLINE_KEY, a);
}
