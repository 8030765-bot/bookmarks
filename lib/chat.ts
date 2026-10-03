import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { ChatMessage } from "./types";
import { notify } from "./userdata";
import { REV_KEYS, bumpRev } from "./revs";

const MESSAGES_KEY = "chat:messages";
const DELETED_KEY = "chat:deleted";
const BANNED_KEY = "chat:banned";
const REACTIONS_KEY = "chat:reactions"; // hash: message id -> { emoji: [users] }
export const REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "😮", "😢"];
const MAX_MESSAGES = 200;
export const MAX_MESSAGE_LENGTH = 500;

function getRedis() {
  return Redis.fromEnv();
}

/** Newest-last list of recent messages, with admin-deleted ones filtered out. */
export async function getMessages(): Promise<ChatMessage[]> {
  const redis = getRedis();
  const [raw, deleted, reactions] = await Promise.all([
    redis.lrange<ChatMessage>(MESSAGES_KEY, 0, MAX_MESSAGES - 1),
    redis.smembers(DELETED_KEY),
    redis.hgetall<Record<string, Record<string, string[]>>>(REACTIONS_KEY),
  ]);
  const hidden = new Set(deleted);
  return raw
    .filter((m) => m && !hidden.has(m.id))
    .map((m) => (reactions?.[m.id] ? { ...m, reactions: reactions[m.id] } : m))
    .reverse();
}

export async function postMessage(username: string, text: string, replyToId?: string): Promise<ChatMessage> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message is empty");
  if (trimmed.length > MAX_MESSAGE_LENGTH) throw new Error(`Max ${MAX_MESSAGE_LENGTH} characters`);
  const redis = getRedis();
  if (await redis.sismember(BANNED_KEY, username.toLowerCase())) {
    throw new Error("You've been muted by an admin");
  }
  // simple anti-spam: one message per user per second
  const allowed = await redis.set(`chat:cooldown:${username.toLowerCase()}`, 1, { nx: true, ex: 1 });
  if (!allowed) throw new Error("Slow down a little!");
  const msg: ChatMessage = { id: uuid(), user: username, text: trimmed, at: new Date().toISOString() };
  if (replyToId) {
    const target = (await getMessages()).find((m) => m.id === replyToId);
    if (target) msg.replyTo = { id: target.id, user: target.user, text: target.text.slice(0, 80) };
  }
  await redis.lpush(MESSAGES_KEY, msg);
  await redis.ltrim(MESSAGES_KEY, 0, MAX_MESSAGES - 1);
  await bumpRev(REV_KEYS.chat);
  // notify @mentions and the person being replied to (never yourself)
  const targets = new Set<string>();
  for (const m of trimmed.matchAll(/@([a-zA-Z0-9_]{3,20})/g)) targets.add(m[1].toLowerCase());
  if (msg.replyTo) targets.add(msg.replyTo.user.toLowerCase());
  targets.delete(username.toLowerCase());
  for (const t of targets) {
    const reply = msg.replyTo && t === msg.replyTo.user.toLowerCase();
    notify(t, { kind: reply ? "reply" : "mention", from: username, text: `${username} ${reply ? "replied to you" : "mentioned you"}: ${trimmed.slice(0, 60)}`, link: "/?chat=open" }).catch(() => {});
  }
  return msg;
}

export async function deleteMessage(id: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd(DELETED_KEY, id);
  await bumpRev(REV_KEYS.chat);
}

export async function clearChat(): Promise<void> {
  await getRedis().del(MESSAGES_KEY, DELETED_KEY, REACTIONS_KEY);
  await bumpRev(REV_KEYS.chat);
}

export async function getBanned(): Promise<string[]> {
  return getRedis().smembers(BANNED_KEY);
}

export async function setBanned(username: string, banned: boolean): Promise<void> {
  const redis = getRedis();
  if (banned) await redis.sadd(BANNED_KEY, username.toLowerCase());
  else await redis.srem(BANNED_KEY, username.toLowerCase());
}

/** Toggle one emoji reaction from a user on a message. */
export async function toggleReaction(username: string, id: string, emoji: string): Promise<void> {
  if (!REACTION_EMOJIS.includes(emoji)) throw new Error("Unknown reaction");
  const redis = getRedis();
  if (!(await getMessages()).some((m) => m.id === id)) throw new Error("Message not found");
  const current = (await redis.hget<Record<string, string[]>>(REACTIONS_KEY, id)) || {};
  const who = username.toLowerCase();
  const users = new Set(current[emoji] || []);
  if (users.has(who)) users.delete(who);
  else users.add(who);
  if (users.size) current[emoji] = Array.from(users);
  else delete current[emoji];
  if (Object.keys(current).length) await redis.hset(REACTIONS_KEY, { [id]: current });
  else await redis.hdel(REACTIONS_KEY, id);
  await bumpRev(REV_KEYS.chat);
}
