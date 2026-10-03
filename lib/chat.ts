import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { ChatMessage } from "./types";

const MESSAGES_KEY = "chat:messages";
const DELETED_KEY = "chat:deleted";
const BANNED_KEY = "chat:banned";
const MAX_MESSAGES = 200;
export const MAX_MESSAGE_LENGTH = 500;

function getRedis() {
  return Redis.fromEnv();
}

/** Newest-last list of recent messages, with admin-deleted ones filtered out. */
export async function getMessages(): Promise<ChatMessage[]> {
  const redis = getRedis();
  const [raw, deleted] = await Promise.all([
    redis.lrange<ChatMessage>(MESSAGES_KEY, 0, MAX_MESSAGES - 1),
    redis.smembers(DELETED_KEY),
  ]);
  const hidden = new Set(deleted);
  return raw.filter((m) => m && !hidden.has(m.id)).reverse();
}

export async function postMessage(username: string, text: string): Promise<ChatMessage> {
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
  await redis.lpush(MESSAGES_KEY, msg);
  await redis.ltrim(MESSAGES_KEY, 0, MAX_MESSAGES - 1);
  return msg;
}

export async function deleteMessage(id: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd(DELETED_KEY, id);
}

export async function clearChat(): Promise<void> {
  await getRedis().del(MESSAGES_KEY, DELETED_KEY);
}

export async function getBanned(): Promise<string[]> {
  return getRedis().smembers(BANNED_KEY);
}

export async function setBanned(username: string, banned: boolean): Promise<void> {
  const redis = getRedis();
  if (banned) await redis.sadd(BANNED_KEY, username.toLowerCase());
  else await redis.srem(BANNED_KEY, username.toLowerCase());
}
