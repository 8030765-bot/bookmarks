import { Redis } from "@upstash/redis";
import { ChatChannel, ChatServer } from "./types";
import { listChannels, removeChannel, saveChannel } from "./chat";
import { REV_KEYS, bumpRev } from "./revs";

/**
 * Servers: groups anyone can make, each with its own channels (Discord
 * style). A server's channels are ordinary chat channels with a
 * `serverId`, so everything chat does — the word filter, mutes, slow
 * mode, pictures waiting for a moderator, reports — works the same.
 * Staff can see and manage every server, including invite-only ones.
 */
const SERVERS_KEY = "chat:servers"; // hash: server id -> ChatServer

export const MAX_OWNED = 3;
export const MAX_JOINED = 25;
export const MAX_MEMBERS = 200;
export const MAX_CHANNELS = 15;
export const SERVER_COLORS = ["#5865f2", "#3ba55d", "#faa61a", "#ed4245", "#eb459e", "#9b59b6", "#1abc9c", "#e67e22", "#607d8b"];

const redis = () => Redis.fromEnv();
const lc = (u: string) => u.toLowerCase();
const code = (n: number) => Array.from({ length: n }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
export const serverChannelId = (sid: string, name: string) => `s-${sid}-${slug(name) || "chat"}`;

export async function listServers(): Promise<ChatServer[]> {
  const all = (await redis().hgetall<Record<string, ChatServer>>(SERVERS_KEY)) || {};
  return Object.values(all).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function getServer(id: string): Promise<ChatServer | null> {
  if (!/^[a-z0-9]{1,12}$/.test(id || "")) return null;
  return (await redis().hget<ChatServer>(SERVERS_KEY, id)) || null;
}
async function put(s: ChatServer) {
  await redis().hset(SERVERS_KEY, { [s.id]: s });
  await bumpRev(REV_KEYS.chat);
}

export const isServerMember = (s: ChatServer | null | undefined, user?: string | null) => !!s && !!user && s.members.includes(lc(user));
export const canManageServer = (s: ChatServer, user: string, staff: boolean) => staff || s.owner === lc(user) || (s.mods || []).includes(lc(user));

/** The servers someone is in. */
export async function serversFor(user: string): Promise<ChatServer[]> {
  return (await listServers()).filter((s) => s.members.includes(lc(user)));
}

function cleanText(v: unknown, max: number) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function createServer(user: string, input: Record<string, unknown>): Promise<ChatServer> {
  const name = cleanText(input.name, 40);
  if (name.length < 2) throw new Error("Give the server a name (at least 2 letters)");
  const all = await listServers();
  if (all.filter((s) => s.owner === lc(user)).length >= MAX_OWNED) throw new Error(`You can own up to ${MAX_OWNED} servers — delete one first`);
  if (all.filter((s) => s.members.includes(lc(user))).length >= MAX_JOINED) throw new Error(`You're in ${MAX_JOINED} servers already — leave one first`);
  let id = code(6);
  while (all.some((s) => s.id === id)) id = code(6);
  const server: ChatServer = {
    id,
    name,
    icon: cleanText(input.icon, 8) || name.slice(0, 1).toUpperCase(),
    color: SERVER_COLORS.includes(String(input.color)) ? String(input.color) : SERVER_COLORS[all.length % SERVER_COLORS.length],
    description: cleanText(input.description, 160) || undefined,
    owner: lc(user),
    createdAt: new Date().toISOString(),
    public: input.public !== false,
    invite: code(8),
    members: [lc(user)],
    channels: [],
  };
  const starter = [{ name: "general", emoji: "💬", topic: `Welcome to ${name}!` }];
  for (const c of starter) {
    const ch: ChatChannel = { id: serverChannelId(id, c.name), name: c.name, emoji: c.emoji, topic: c.topic, serverId: id, createdAt: server.createdAt };
    await saveChannel(ch);
    server.channels.push(ch.id);
  }
  await put(server);
  return server;
}

export async function updateServer(server: ChatServer, input: Record<string, unknown>): Promise<ChatServer> {
  const next: ChatServer = { ...server };
  if (input.name !== undefined) {
    const name = cleanText(input.name, 40);
    if (name.length < 2) throw new Error("Give the server a name (at least 2 letters)");
    next.name = name;
  }
  if (input.icon !== undefined) next.icon = cleanText(input.icon, 8) || next.name.slice(0, 1).toUpperCase();
  if (input.color !== undefined && SERVER_COLORS.includes(String(input.color))) next.color = String(input.color);
  if (input.description !== undefined) next.description = cleanText(input.description, 160) || undefined;
  if (input.public !== undefined) next.public = input.public !== false;
  await put(next);
  return next;
}

export async function newInvite(server: ChatServer): Promise<ChatServer> {
  const next = { ...server, invite: code(8) };
  await put(next);
  return next;
}

/** Join by a public server's id, or by an invite code. */
export async function joinServer(user: string, idOrInvite: string, staff: boolean): Promise<ChatServer> {
  const key = String(idOrInvite || "").trim().toLowerCase().replace(/^.*[?&]join=/, "");
  const all = await listServers();
  const server = all.find((s) => s.invite === key) || all.find((s) => s.id === key && (s.public || staff));
  if (!server) throw new Error("That invite doesn't work — it may be old or mistyped");
  if (server.members.includes(lc(user))) return server;
  if ((server.banned || []).includes(lc(user))) throw new Error("You can't join that server");
  if (server.members.length >= MAX_MEMBERS) throw new Error("That server is full");
  if (all.filter((s) => s.members.includes(lc(user))).length >= MAX_JOINED) throw new Error(`You're in ${MAX_JOINED} servers already — leave one first`);
  const next = { ...server, members: [...server.members, lc(user)] };
  await put(next);
  return next;
}

export async function leaveServer(user: string, server: ChatServer): Promise<void> {
  if (server.owner === lc(user)) throw new Error("You own this server — delete it from Server settings instead");
  await put({ ...server, members: server.members.filter((m) => m !== lc(user)), mods: (server.mods || []).filter((m) => m !== lc(user)) });
}

/** Remove someone (and optionally stop them coming back). */
export async function kickMember(server: ChatServer, target: string, ban: boolean): Promise<ChatServer> {
  const t = lc(target);
  if (t === server.owner) throw new Error("The owner can't be removed");
  const next: ChatServer = {
    ...server,
    members: server.members.filter((m) => m !== t),
    mods: (server.mods || []).filter((m) => m !== t),
    banned: ban ? Array.from(new Set([...(server.banned || []), t])) : (server.banned || []).filter((m) => m !== t),
  };
  await put(next);
  return next;
}

export async function setServerMod(server: ChatServer, target: string, on: boolean): Promise<ChatServer> {
  const t = lc(target);
  if (!server.members.includes(t)) throw new Error("They're not in this server");
  const mods = new Set(server.mods || []);
  if (on) mods.add(t); else mods.delete(t);
  const next = { ...server, mods: Array.from(mods) };
  await put(next);
  return next;
}

export async function addServerChannel(server: ChatServer, input: Record<string, unknown>): Promise<ChatServer> {
  if (server.channels.length >= MAX_CHANNELS) throw new Error(`A server can have up to ${MAX_CHANNELS} channels`);
  const name = slug(cleanText(input.name, 28));
  if (!name) throw new Error("Give the channel a name");
  const id = serverChannelId(server.id, name);
  if (server.channels.includes(id)) throw new Error(`#${name} already exists`);
  const ch: ChatChannel = {
    id, name, serverId: server.id, createdAt: new Date().toISOString(),
    emoji: cleanText(input.emoji, 8) || "💬",
    topic: cleanText(input.topic, 120) || undefined,
  };
  await saveChannel(ch);
  const next = { ...server, channels: [...server.channels, id] };
  await put(next);
  return next;
}

export async function editServerChannel(server: ChatServer, id: string, input: Record<string, unknown>): Promise<void> {
  if (!server.channels.includes(id)) throw new Error("That channel isn't in this server");
  const ch = (await listChannels()).find((c) => c.id === id);
  if (!ch) throw new Error("Channel not found");
  await saveChannel({
    ...ch,
    emoji: input.emoji !== undefined ? cleanText(input.emoji, 8) || "💬" : ch.emoji,
    topic: input.topic !== undefined ? cleanText(input.topic, 120) || undefined : ch.topic,
    slow: typeof input.slow === "number" ? Math.min(300, Math.max(0, Math.round(input.slow))) || undefined : ch.slow,
  });
}

export async function removeServerChannel(server: ChatServer, id: string): Promise<ChatServer> {
  if (!server.channels.includes(id)) throw new Error("That channel isn't in this server");
  if (server.channels.length <= 1) throw new Error("A server needs at least one channel");
  await removeChannel(id);
  const next = { ...server, channels: server.channels.filter((c) => c !== id) };
  await put(next);
  return next;
}

export async function deleteServer(server: ChatServer): Promise<void> {
  for (const id of server.channels) await removeChannel(id).catch(() => {});
  await redis().hdel(SERVERS_KEY, server.id);
  await bumpRev(REV_KEYS.chat);
}
