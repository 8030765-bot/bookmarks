import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { ChatChannel, ChatMessage } from "./types";
import { notify } from "./userdata";
import { REV_KEYS, bumpRev } from "./revs";

/**
 * Chat, in channels. Each channel keeps its newest 500 messages in a
 * Redis list; reactions, poll votes, pins and "who's typing" live in
 * small side keys so the list itself rarely needs rewriting.
 */
const DELETED_KEY = "chat:deleted";
const BANNED_KEY = "chat:banned";
const REACTIONS_KEY = "chat:reactions"; // hash: message id -> { emoji: [users] }
const POLL_KEY = "chat:pollvotes"; // hash: message id -> { optionIndex: [users] }
const CHANNELS_KEY = "chat:channels"; // hash: channel id -> ChatChannel
const KEYWORDS_KEY = "chat:keywords"; // hash: username -> words to be alerted about
const pinsKey = (ch: string) => `chat:pins:${ch}`;
const typingKey = (ch: string) => `chat:typing:${ch}`;
// "general" keeps the original key so the existing history carries over
export const messagesKey = (ch: string) => (ch === "general" ? "chat:messages" : `chat:messages:${ch}`);

export const REACTION_EMOJIS = ["👍", "😂", "❤️", "🔥", "😮", "😢", "🎉", "👀", "✅", "💯"];
const MAX_MESSAGES = 500;
const PAGE = 100;
export const MAX_MESSAGE_LENGTH = 500;
const MAX_PINS = 5;

export const BUILTIN_CHANNELS: ChatChannel[] = [
  { id: "general", name: "general", emoji: "💬", topic: "Anything goes (be kind)" },
  { id: "help", name: "help", emoji: "🙋", topic: "Ask a question — mark it answered when you're sorted" },
  { id: "random", name: "random", emoji: "🎲", topic: "Off-topic, memes, games talk" },
];

function getRedis() {
  return Redis.fromEnv();
}

export function cleanChannelId(ch: unknown): string {
  const id = String(ch || "general").toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(id) ? id : "general";
}

/* ---------- channels ---------- */
export async function listChannels(): Promise<ChatChannel[]> {
  const stored = (await getRedis().hgetall<Record<string, ChatChannel>>(CHANNELS_KEY)) || {};
  const builtins = BUILTIN_CHANNELS.map((c) => ({ ...c, ...(stored[c.id] || {}) }));
  const extra = Object.values(stored).filter((c) => !BUILTIN_CHANNELS.some((b) => b.id === c.id));
  return [...builtins, ...extra.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))];
}
export async function getChannel(ch: string): Promise<ChatChannel | null> {
  return (await listChannels()).find((c) => c.id === ch) || null;
}
export async function saveChannel(c: ChatChannel) {
  await getRedis().hset(CHANNELS_KEY, { [c.id]: c });
  await bumpRev(REV_KEYS.chat);
}
export async function removeChannel(ch: string) {
  if (BUILTIN_CHANNELS.some((b) => b.id === ch)) throw new Error("The built-in channels can't be removed");
  const redis = getRedis();
  await redis.hdel(CHANNELS_KEY, ch);
  await redis.del(messagesKey(ch), pinsKey(ch), typingKey(ch));
  await bumpRev(REV_KEYS.chat);
}

async function rawMessages(ch: string): Promise<ChatMessage[]> {
  return getRedis().lrange<ChatMessage>(messagesKey(ch), 0, MAX_MESSAGES - 1);
}

/**
 * Newest-last messages for a channel (100 at a time; `before` pages back),
 * with deleted ones removed and reactions, poll votes and reply counts merged in.
 */
export async function getMessages(ch = "general", opts: { before?: string; all?: boolean } = {}): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const redis = getRedis();
  const [raw, deleted, reactions, votes] = await Promise.all([
    rawMessages(ch),
    redis.smembers(DELETED_KEY),
    redis.hgetall<Record<string, Record<string, string[]>>>(REACTIONS_KEY),
    redis.hgetall<Record<string, Record<string, string[]>>>(POLL_KEY),
  ]);
  const hidden = new Set(deleted);
  const live = raw.filter((m) => m && !hidden.has(m.id)).reverse(); // oldest first
  const replyCounts = new Map<string, number>();
  live.forEach((m) => m.replyTo && replyCounts.set(m.replyTo.id, (replyCounts.get(m.replyTo.id) || 0) + 1));
  const merged = live.map((m) => ({
    ...m,
    channel: m.channel || ch,
    ...(reactions?.[m.id] ? { reactions: reactions[m.id] } : {}),
    ...(m.poll ? { poll: { ...m.poll, votes: votes?.[m.id] || {} } } : {}),
    ...(replyCounts.get(m.id) ? { replies: replyCounts.get(m.id) } : {}),
  }));
  if (opts.all) return { messages: merged, hasMore: false };
  let end = merged.length;
  if (opts.before) {
    const i = merged.findIndex((m) => m.id === opts.before);
    if (i >= 0) end = i;
  }
  const start = Math.max(0, end - PAGE);
  return { messages: merged.slice(start, end), hasMore: start > 0 };
}

/** Every recent message across channels (for stats, search and "download my messages"). */
export async function getAllMessages(): Promise<ChatMessage[]> {
  const channels = await listChannels();
  const lists = await Promise.all(channels.map((c) => getMessages(c.id, { all: true }).then((r) => r.messages)));
  return lists.flat().sort((a, b) => a.at.localeCompare(b.at));
}

/* ---------- sending ---------- */
export interface SendOptions {
  channel?: string;
  replyTo?: string;
  /** admin-only highlighted message */
  announce?: boolean;
  maxLen?: number;
  /** if set, links may only point at these websites */
  linkAllow?: string[];
}

function rollDice(spec: string): string | null {
  const m = /^(\d{0,2})d(\d{1,3})$/i.exec(spec || "1d6");
  if (!m) return null;
  const n = Math.min(10, Math.max(1, Number(m[1] || 1)));
  const sides = Math.min(1000, Math.max(2, Number(m[2])));
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  return `🎲 rolled ${n}d${sides}: ${rolls.join(" + ")}${n > 1 ? ` = ${rolls.reduce((a, b) => a + b, 0)}` : ""}`;
}

export async function postMessage(username: string, text: string, opts: SendOptions = {}): Promise<ChatMessage> {
  const ch = cleanChannelId(opts.channel);
  let trimmed = text.trim();
  if (!trimmed) throw new Error("Message is empty");
  const max = Math.min(MAX_MESSAGE_LENGTH, opts.maxLen || MAX_MESSAGE_LENGTH);
  if (trimmed.length > max) throw new Error(`Messages can be at most ${max} characters here`);
  const redis = getRedis();
  if (await redis.sismember(BANNED_KEY, username.toLowerCase())) {
    throw new Error("You've been muted by an admin");
  }
  const channel = await getChannel(ch);
  if (!channel) throw new Error("That channel doesn't exist");
  const who = username.toLowerCase();
  const msg: ChatMessage = { id: uuid(), user: username, text: trimmed, at: new Date().toISOString(), channel: ch };
  // slash commands
  const cmd = /^\/(\w+)\s*([\s\S]*)$/.exec(trimmed);
  if (cmd) {
    const [, name, rest] = cmd;
    const c = name.toLowerCase();
    if (c === "shrug") msg.text = `${rest ? `${rest} ` : ""}¯\\_(ツ)_/¯`;
    else if (c === "flip") {
      msg.text = `🪙 flipped a coin: ${Math.random() < 0.5 ? "Heads" : "Tails"}`;
      msg.kind = "roll";
    } else if (c === "roll") {
      const r = rollDice(rest.trim());
      if (!r) throw new Error("Try /roll, /roll d20 or /roll 2d6");
      msg.text = r;
      msg.kind = "roll";
    } else if (c === "me") {
      if (!rest.trim()) throw new Error("Type something after /me");
      msg.text = rest.trim();
      msg.kind = "me";
    } else if (c === "poll") {
      const parts = rest.split("|").map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) throw new Error("Make a poll like: /poll Best snack? | Chips | Fruit | Cookies");
      msg.poll = { question: parts[0].slice(0, 150), options: parts.slice(1, 7).map((o) => o.slice(0, 60)) };
      msg.text = msg.poll.question;
      msg.kind = "poll";
    } else if (c === "announce") {
      if (!opts.announce) throw new Error("Only admins can make announcements");
      msg.text = rest.trim() || "📣";
      msg.kind = "announce";
    } else {
      throw new Error(`Unknown command /${name} — try /roll, /flip, /shrug, /me or /poll`);
    }
  }
  trimmed = msg.text;
  // simple anti-spam: one message per second, plus the channel's slow mode
  const allowed = await redis.set(`chat:cooldown:${who}`, 1, { nx: true, ex: 1 });
  if (!allowed) throw new Error("Slow down a little!");
  if (channel.slow) {
    const ok = await redis.set(`chat:slow:${ch}:${who}`, 1, { nx: true, ex: channel.slow });
    if (!ok) throw new Error(`Slow mode is on in #${channel.name} — one message every ${channel.slow} seconds`);
  }
  // the same message again and again is spam
  const lastKey = `chat:last:${who}`;
  const last = await redis.get<string>(lastKey);
  if (last && String(last) === trimmed.toLowerCase()) throw new Error("You just sent that — try saying something new");
  await redis.set(lastKey, trimmed.toLowerCase(), { ex: 30 });
  if (opts.linkAllow?.length) {
    for (const m of trimmed.matchAll(/https?:\/\/([^/\s]+)/gi)) {
      const host = m[1].toLowerCase().replace(/^www\./, "");
      if (!opts.linkAllow.some((d) => host === d || host.endsWith(`.${d}`))) throw new Error(`Links to ${host} aren't allowed in chat`);
    }
  }

  if (opts.replyTo) {
    const target = (await rawMessages(ch)).find((m) => m.id === opts.replyTo);
    if (target) msg.replyTo = { id: target.id, user: target.user, text: target.text.slice(0, 80) };
  }
  await redis.lpush(messagesKey(ch), msg);
  await redis.ltrim(messagesKey(ch), 0, MAX_MESSAGES - 1);
  await redis.hdel(typingKey(ch), who);
  await bumpRev(REV_KEYS.chat);

  // notify @mentions, the person being replied to, and anyone watching for a keyword (never yourself)
  const link = `/?chat=open&ch=${ch}&msg=${msg.id}`;
  const told = new Set<string>([who]);
  const tell = (t: string, kind: "reply" | "mention", text: string) => {
    if (told.has(t)) return;
    told.add(t);
    notify(t, { kind, from: username, text, link }).catch(() => {});
  };
  if (msg.replyTo) tell(msg.replyTo.user.toLowerCase(), "reply", `${username} replied to you in #${channel.name}: ${trimmed.slice(0, 60)}`);
  for (const m of trimmed.matchAll(/@([a-zA-Z0-9_]{3,20})/g)) tell(m[1].toLowerCase(), "mention", `${username} mentioned you in #${channel.name}: ${trimmed.slice(0, 60)}`);
  try {
    const watchers = (await redis.hgetall<Record<string, string[]>>(KEYWORDS_KEY)) || {};
    const lower = trimmed.toLowerCase();
    for (const [u, words] of Object.entries(watchers)) {
      const hit = (words || []).find((w) => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(lower));
      if (hit) tell(u, "mention", `“${hit}” came up in #${channel.name}: ${username}: ${trimmed.slice(0, 60)}`);
    }
  } catch {
    // keyword alerts are a nice-to-have
  }
  return msg;
}

/** Find a message in a channel and change it in place. */
async function updateMessage(ch: string, id: string, fn: (m: ChatMessage) => ChatMessage) {
  const redis = getRedis();
  const list = await rawMessages(ch);
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) throw new Error("Message not found");
  const next = fn(list[i]);
  await redis.lset(messagesKey(ch), i, next);
  await bumpRev(REV_KEYS.chat);
  return next;
}

export async function editMessage(username: string, ch: string, id: string, text: string) {
  const t = text.trim();
  if (!t) throw new Error("Message is empty");
  if (t.length > MAX_MESSAGE_LENGTH) throw new Error(`Max ${MAX_MESSAGE_LENGTH} characters`);
  return updateMessage(ch, id, (m) => {
    if (m.user.toLowerCase() !== username.toLowerCase()) throw new Error("You can only edit your own messages");
    if (m.kind && m.kind !== "text" && m.kind !== "me") throw new Error("That message can't be edited");
    if (Date.now() - Date.parse(m.at) > 24 * 3600_000) throw new Error("Messages can only be edited for a day");
    return { ...m, text: t, edited: true };
  });
}

/** Mark a #help question answered (its author or a moderator). */
export async function setAnswered(username: string, ch: string, id: string, answered: boolean, isMod: boolean) {
  return updateMessage(ch, id, (m) => {
    if (!isMod && m.user.toLowerCase() !== username.toLowerCase()) throw new Error("Only the person who asked (or a moderator) can do that");
    return { ...m, answered: answered || undefined };
  });
}

export async function messageOwner(ch: string, id: string): Promise<string | null> {
  return (await rawMessages(ch)).find((m) => m.id === id)?.user || null;
}

export async function deleteMessage(id: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd(DELETED_KEY, id);
  await bumpRev(REV_KEYS.chat);
}

/** Wipe one channel (or all of them). */
export async function clearChat(ch?: string): Promise<void> {
  const redis = getRedis();
  const channels = ch ? [ch] : (await listChannels()).map((c) => c.id);
  await redis.del(...channels.map(messagesKey), ...channels.map(pinsKey));
  if (!ch) await redis.del(DELETED_KEY, REACTIONS_KEY, POLL_KEY);
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
export async function toggleReaction(username: string, ch: string, id: string, emoji: string): Promise<void> {
  if (!REACTION_EMOJIS.includes(emoji)) throw new Error("Unknown reaction");
  const redis = getRedis();
  if (!(await rawMessages(ch)).some((m) => m.id === id)) throw new Error("Message not found");
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

/** One vote per person per poll; voting for the same option again takes it back. */
export async function votePoll(username: string, ch: string, id: string, option: number) {
  const redis = getRedis();
  const msg = (await rawMessages(ch)).find((m) => m.id === id);
  if (!msg?.poll) throw new Error("Poll not found");
  if (!Number.isInteger(option) || option < 0 || option >= msg.poll.options.length) throw new Error("Pick one of the answers");
  const votes = (await redis.hget<Record<string, string[]>>(POLL_KEY, id)) || {};
  const who = username.toLowerCase();
  const had = votes[option]?.includes(who);
  for (const k of Object.keys(votes)) votes[k] = votes[k].filter((u) => u !== who);
  if (!had) votes[option] = [...(votes[option] || []), who];
  await redis.hset(POLL_KEY, { [id]: votes });
  await bumpRev(REV_KEYS.chat);
}

/* ---------- pins ---------- */
export async function getPins(ch: string): Promise<ChatMessage[]> {
  return getRedis().lrange<ChatMessage>(pinsKey(ch), 0, MAX_PINS - 1);
}
export async function setPinned(ch: string, id: string, pinned: boolean) {
  const redis = getRedis();
  const pins = await getPins(ch);
  const rest = pins.filter((p) => p.id !== id);
  if (pinned) {
    const msg = (await rawMessages(ch)).find((m) => m.id === id);
    if (!msg) throw new Error("Message not found");
    rest.unshift(msg);
  }
  await redis.del(pinsKey(ch));
  if (rest.length) await redis.rpush(pinsKey(ch), ...rest.slice(0, MAX_PINS));
  await bumpRev(REV_KEYS.chat);
}

/* ---------- typing ---------- */
export async function setTyping(username: string, ch: string) {
  await getRedis().hset(typingKey(ch), { [username]: Date.now() });
}
export async function getTyping(ch: string): Promise<string[]> {
  const raw = (await getRedis().hgetall<Record<string, number>>(typingKey(ch))) || {};
  const now = Date.now();
  return Object.entries(raw).filter(([, t]) => now - Number(t) < 6000).map(([u]) => u);
}

/* ---------- keyword alerts ---------- */
export async function getKeywords(username: string): Promise<string[]> {
  return (await getRedis().hget<string[]>(KEYWORDS_KEY, username.toLowerCase())) || [];
}
export async function setKeywords(username: string, words: unknown): Promise<string[]> {
  const list = Array.isArray(words)
    ? Array.from(new Set(words.map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 3 && w.length <= 30))).slice(0, 10)
    : [];
  const redis = getRedis();
  if (list.length) await redis.hset(KEYWORDS_KEY, { [username.toLowerCase()]: list });
  else await redis.hdel(KEYWORDS_KEY, username.toLowerCase());
  return list;
}

/** Messages anywhere containing every word of a search. */
export async function searchMessages(q: string, channels: string[]): Promise<ChatMessage[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = await Promise.all(channels.map((c) => getMessages(c, { all: true }).then((r) => r.messages)));
  return all.flat().filter((m) => words.every((w) => `${m.user} ${m.text}`.toLowerCase().includes(w))).slice(-50).reverse();
}
