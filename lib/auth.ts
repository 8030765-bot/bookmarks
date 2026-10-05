import { Redis } from "@upstash/redis";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";

export const SESSION_COOKIE = "bm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days ("remember me")
const SHORT_SESSION_SECONDS = 60 * 60 * 24; // 1 day otherwise
const TICKET_SECONDS = 5 * 60; // time to type the 2-step code
const RENAME_COOLDOWN_DAYS = 30;

interface Session {
  token: string;
  username: string;
  /** seconds until it expires */
  ttl?: number;
}

export interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
  /** hash of a one-time recovery code, for forgotten-password resets */
  recoveryHash?: string;
  /** authenticator-app secret when 2-step login is on */
  totpSecret?: string;
  /** last 30-second window a code was used in (stops a code being reused) */
  totpLastStep?: number;
  /** when the username was last changed */
  renamedAt?: string;
  /** earlier usernames, newest first */
  previousNames?: string[];
}

/** What's stored per login (never the password). */
interface SessionData {
  username: string;
  createdAt?: string;
  device?: string;
  /** "keep me logged in" was ticked (older sessions didn't record it: assume yes) */
  remember?: boolean;
}

function genRecoveryCode(): string {
  // 12 hex chars, shown in groups of 4 — easy to write down
  return randomBytes(6).toString("hex");
}

function getRedis() {
  return Redis.fromEnv();
}

const USER_INDEX = "users:index";
export const userKey = (username: string) => `users:${username.toLowerCase()}`;
const sessionKey = (token: string) => `sessions:${token}`;
export const userSessionsKey = (username: string) => `usersessions:${username.toLowerCase()}`;
const loginLogKey = (username: string) => `loginlog:${username.toLowerCase()}`;
const devicesKey = (username: string) => `devices:${username.toLowerCase()}`;
const ticketKey = (ticket: string) => `login2fa:${ticket}`;
const pendingTotpKey = (username: string) => `totp:pending:${username.toLowerCase()}`;
/** A short, non-secret id for a session, so it can be listed and signed out. */
const sessionId = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 12);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

export function validateUsername(username: string) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new Error("Username must be 3–20 letters, numbers or _");
}
/** For "is this name free?" while someone types. */
export async function usernameTaken(username: string) {
  return (await getRedis().exists(userKey(username))) > 0;
}
export function validateCredentials(username: string, password: string) {
  validateUsername(username);
  if (password.length < 6 || password.length > 100) {
    throw new Error("Password must be at least 6 characters");
  }
}

/** "Chrome on Windows" from a browser's user-agent string (nothing more specific is kept). */
export function deviceName(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /CrOS/.test(ua) ? "Chromebook" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone/iPad"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
function currentDevice(): string {
  try {
    return deviceName(headers().get("user-agent") || "");
  } catch {
    return "a browser";
  }
}

async function getUser(username: string): Promise<StoredUser | null> {
  return getRedis().get<StoredUser>(userKey(username));
}

async function createSession(username: string, remember = true): Promise<Session> {
  const token = randomBytes(32).toString("hex");
  const ttl = remember ? SESSION_TTL_SECONDS : SHORT_SESSION_SECONDS;
  const redis = getRedis();
  // stored as an object so all-digit usernames don't get auto-parsed into numbers
  const data: SessionData = { username, createdAt: new Date().toISOString(), device: currentDevice(), remember };
  await redis.set(sessionKey(token), data, { ex: ttl });
  await redis.sadd(userSessionsKey(username), token);
  await redis.expire(userSessionsKey(username), SESSION_TTL_SECONDS + 86400);
  return { token, username, ttl };
}

/** remember=false: the cookie is dropped when the browser closes (and the login lasts a day at most). */
export function setSessionCookie(token: string, remember = true) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: SESSION_TTL_SECONDS } : {}),
    priority: "high",
  });
}

/* ---------- login history + new-device alerts ---------- */
export interface LoginEntry { at: string; device: string; ok: boolean; how?: string }
async function logLogin(username: string, entry: Omit<LoginEntry, "at" | "device">) {
  const redis = getRedis();
  const e: LoginEntry = { at: new Date().toISOString(), device: currentDevice(), ...entry };
  await redis.lpush(loginLogKey(username), e);
  await redis.ltrim(loginLogKey(username), 0, 19);
}
export async function loginHistory(username: string): Promise<LoginEntry[]> {
  return getRedis().lrange<LoginEntry>(loginLogKey(username), 0, 19);
}
/** True the first time an account logs in from a kind of device it hasn't used before. */
async function isNewDevice(username: string): Promise<boolean> {
  const redis = getRedis();
  const device = currentDevice();
  const known = await redis.smembers(devicesKey(username));
  await redis.sadd(devicesKey(username), device);
  return known.length > 0 && !known.includes(device);
}

export async function signup(username: string, password: string, remember = true): Promise<Session & { recoveryCode: string }> {
  validateCredentials(username, password);
  const recoveryCode = genRecoveryCode();
  const user: StoredUser = {
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    recoveryHash: hashPassword(recoveryCode),
  };
  // nx: only create if the username isn't taken (case-insensitive)
  const created = await getRedis().set(userKey(username), user, { nx: true });
  if (!created) throw new Error("That username is already taken");
  await getRedis().sadd(USER_INDEX, username.toLowerCase());
  await isNewDevice(username);
  await logLogin(username, { ok: true, how: "signup" });
  return { ...(await createSession(username, remember)), recoveryCode };
}

export type LoginResult = (Session & { newDevice?: boolean }) | { needs2fa: true; ticket: string; username: string };

export async function login(username: string, password: string, remember = true): Promise<LoginResult> {
  const redis = getRedis();
  const failKey = `login_fail:${username.toLowerCase()}`;
  const fails = (await redis.get<number>(failKey)) || 0;
  if (fails >= 10) throw new Error("Too many attempts — try again in 15 minutes");
  const user = await getUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await redis.incr(failKey);
    await redis.expire(failKey, 15 * 60);
    if (user) await logLogin(user.username, { ok: false, how: "wrong password" });
    throw new Error(fails >= 6 ? `Wrong username or password (${9 - fails} tries left)` : "Wrong username or password");
  }
  await redis.del(failKey);
  // backfill: accounts created before the index existed get added on next login
  await redis.sadd(USER_INDEX, user.username.toLowerCase());
  if (user.totpSecret) {
    // password was right; now the 6-digit code from their authenticator app
    const ticket = randomBytes(24).toString("hex");
    await redis.set(ticketKey(ticket), { username: user.username, remember, tries: 0 }, { ex: TICKET_SECONDS });
    return { needs2fa: true, ticket, username: user.username };
  }
  return finishLogin(user.username, remember, "password");
}

async function finishLogin(username: string, remember: boolean, how: string) {
  const newDevice = await isNewDevice(username);
  await logLogin(username, { ok: true, how });
  return { ...(await createSession(username, remember)), newDevice };
}

/** Second step of a 2-step login. */
export async function loginWithCode(ticket: string, code: string): Promise<Session & { newDevice?: boolean }> {
  const redis = getRedis();
  if (!/^[a-f0-9]{48}$/.test(ticket)) throw new Error("That login expired — enter your password again");
  const t = await redis.get<{ username: string; remember: boolean; tries: number }>(ticketKey(ticket));
  if (!t) throw new Error("That login expired — enter your password again");
  const user = await getUser(t.username);
  if (!user?.totpSecret) throw new Error("That login expired — enter your password again");
  const step = verifyTotp(user.totpSecret, code, user.totpLastStep || 0);
  if (step < 0) {
    if (t.tries >= 4) { await redis.del(ticketKey(ticket)); throw new Error("Too many wrong codes — enter your password again"); }
    await redis.set(ticketKey(ticket), { ...t, tries: t.tries + 1 }, { ex: TICKET_SECONDS });
    await logLogin(user.username, { ok: false, how: "wrong 2-step code" });
    throw new Error("Wrong code — check your authenticator app");
  }
  user.totpLastStep = step;
  await redis.set(userKey(user.username), user);
  await redis.del(ticketKey(ticket));
  return finishLogin(user.username, t.remember, "password + code");
}

/* ---------- 2-step login setup ---------- */
export async function startTotp(username: string) {
  const user = await getUser(username);
  if (!user) throw new Error("No such account");
  if (user.totpSecret) throw new Error("2-step login is already on");
  const secret = newTotpSecret();
  await getRedis().set(pendingTotpKey(username), secret, { ex: 600 });
  return { secret, uri: otpauthUri(secret, user.username) };
}
export async function confirmTotp(username: string, code: string) {
  const redis = getRedis();
  const secret = await redis.get<string>(pendingTotpKey(username));
  if (!secret) throw new Error("Setup timed out — start again");
  const step = verifyTotp(String(secret), code);
  if (step < 0) throw new Error("That code didn't match — try the newest one in the app");
  const user = await getUser(username);
  if (!user) throw new Error("No such account");
  user.totpSecret = String(secret);
  user.totpLastStep = step;
  await redis.set(userKey(user.username), user);
  await redis.del(pendingTotpKey(username));
}
export async function disableTotp(username: string, password: string) {
  const user = await getUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("Current password is wrong");
  delete user.totpSecret;
  delete user.totpLastStep;
  await getRedis().set(userKey(user.username), user);
}

/** Facts about your own account for the security screen. */
export async function accountInfo(username: string) {
  const user = await getUser(username);
  if (!user) throw new Error("No such account");
  const days = user.renamedAt ? (Date.now() - Date.parse(user.renamedAt)) / 86400_000 : Infinity;
  return {
    username: user.username,
    createdAt: user.createdAt,
    twoStep: !!user.totpSecret,
    hasRecoveryCode: !!user.recoveryHash,
    previousNames: user.previousNames || [],
    canRenameIn: days >= RENAME_COOLDOWN_DAYS ? 0 : Math.ceil(RENAME_COOLDOWN_DAYS - days),
  };
}

/* ---------- sessions: list, sign out one, sign out everywhere ---------- */
export interface SessionInfo { id: string; device: string; createdAt?: string; current: boolean }
export async function listSessions(username: string): Promise<SessionInfo[]> {
  const redis = getRedis();
  const tokens = await redis.smembers(userSessionsKey(username));
  if (!tokens.length) return [];
  const current = cookies().get(SESSION_COOKIE)?.value;
  const datas = await redis.mget<(SessionData | null)[]>(...tokens.map(sessionKey));
  const gone = tokens.filter((_, i) => !datas[i]);
  if (gone.length) await redis.srem(userSessionsKey(username), ...gone);
  return tokens
    .map((t, i) => ({ t, d: datas[i] }))
    .filter((x): x is { t: string; d: SessionData } => !!x.d)
    .map(({ t, d }) => ({ id: sessionId(t), device: d.device || "a browser", createdAt: d.createdAt, current: t === current }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
export async function revokeSession(username: string, id: string) {
  const redis = getRedis();
  const tokens = await redis.smembers(userSessionsKey(username));
  const token = tokens.find((t) => sessionId(t) === id);
  if (!token) throw new Error("That login has already ended");
  await redis.del(sessionKey(token));
  await redis.srem(userSessionsKey(username), token);
}
/** Ends every login for an account, except (optionally) the one making the request. */
export async function logoutEverywhere(username: string, keepCurrent = false) {
  const redis = getRedis();
  const tokens = await redis.smembers(userSessionsKey(username));
  const current = keepCurrent ? cookies().get(SESSION_COOKIE)?.value : undefined;
  const ending = tokens.filter((t) => t !== current);
  if (ending.length) {
    await redis.del(...ending.map(sessionKey));
    await redis.srem(userSessionsKey(username), ...ending);
  }
  return ending.length;
}

/** Reset a forgotten password using the one-time recovery code. Returns a fresh code. */
export async function resetWithCode(username: string, code: string, newPassword: string): Promise<{ recoveryCode: string }> {
  if (newPassword.length < 6 || newPassword.length > 100) throw new Error("Password must be at least 6 characters");
  const redis = getRedis();
  const failKey = `reset_fail:${username.toLowerCase()}`;
  if (((await redis.get<number>(failKey)) || 0) >= 8) throw new Error("Too many attempts — try again in 15 minutes");
  const user = await getUser(username);
  const clean = code.trim().replace(/\s+/g, "").toLowerCase();
  if (!user || !user.recoveryHash || !verifyPassword(clean, user.recoveryHash)) {
    await redis.incr(failKey);
    await redis.expire(failKey, 15 * 60);
    throw new Error("Wrong username or recovery code");
  }
  const recoveryCode = genRecoveryCode();
  user.passwordHash = hashPassword(newPassword);
  user.recoveryHash = hashPassword(recoveryCode);
  // the recovery code is the "lost everything" key, so it also turns 2-step login off
  delete user.totpSecret;
  delete user.totpLastStep;
  await redis.set(userKey(user.username), user);
  await redis.del(failKey, `login_fail:${user.username.toLowerCase()}`);
  await logoutEverywhere(user.username);
  await logLogin(user.username, { ok: true, how: "recovery code reset" });
  return { recoveryCode };
}

/** Logged-in password change (needs the current password). Signs out your other devices. */
export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<number> {
  if (newPassword.length < 6 || newPassword.length > 100) throw new Error("New password must be at least 6 characters");
  const redis = getRedis();
  const user = await getUser(username);
  if (!user || !verifyPassword(oldPassword, user.passwordHash)) throw new Error("Current password is wrong");
  user.passwordHash = hashPassword(newPassword);
  await redis.set(userKey(user.username), user);
  return logoutEverywhere(user.username, true);
}

export async function checkOwnPassword(username: string, password: string) {
  const user = await getUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("Current password is wrong");
  return user;
}

/** Generate a fresh recovery code for a logged-in account (e.g. old accounts that never had one). */
export async function regenerateRecoveryCode(username: string): Promise<string> {
  const redis = getRedis();
  const user = await getUser(username);
  if (!user) throw new Error("No such account");
  const recoveryCode = genRecoveryCode();
  user.recoveryHash = hashPassword(recoveryCode);
  await redis.set(userKey(user.username), user);
  return recoveryCode;
}

/** Admin reset: set a temporary password and return it to hand to the user. */
export async function adminSetPassword(username: string): Promise<{ username: string; tempPassword: string }> {
  const redis = getRedis();
  const user = await getUser(username);
  if (!user) throw new Error("No such account");
  const tempPassword = `reset-${randomBytes(3).toString("hex")}`;
  user.passwordHash = hashPassword(tempPassword);
  await redis.set(userKey(user.username), user);
  await redis.del(`login_fail:${user.username.toLowerCase()}`);
  await logoutEverywhere(user.username);
  return { username: user.username, tempPassword };
}

/** Move the account record to a new name (the rest of the rename lives in lib/account.ts). */
export async function renameUserRecord(oldName: string, newName: string, password: string): Promise<StoredUser> {
  validateUsername(newName);
  const redis = getRedis();
  const user = await checkOwnPassword(oldName, password);
  const sameKey = oldName.toLowerCase() === newName.toLowerCase();
  if (user.renamedAt && Date.now() - Date.parse(user.renamedAt) < RENAME_COOLDOWN_DAYS * 86400_000 && !sameKey) {
    throw new Error(`You can change your username once every ${RENAME_COOLDOWN_DAYS} days`);
  }
  const moved: StoredUser = {
    ...user,
    username: newName,
    renamedAt: sameKey ? user.renamedAt : new Date().toISOString(),
    previousNames: sameKey ? user.previousNames : [user.username, ...(user.previousNames || [])].slice(0, 5),
  };
  if (sameKey) {
    await redis.set(userKey(newName), moved);
    return moved;
  }
  const created = await redis.set(userKey(newName), moved, { nx: true });
  if (!created) throw new Error("That username is already taken");
  await redis.del(userKey(oldName));
  await redis.srem(USER_INDEX, oldName.toLowerCase());
  await redis.sadd(USER_INDEX, newName.toLowerCase());
  // logins, devices and history follow the account
  const tokens = await redis.smembers(userSessionsKey(oldName));
  for (const t of tokens) {
    const d = await redis.get<SessionData>(sessionKey(t));
    if (d) await redis.set(sessionKey(t), { ...d, username: newName }, { keepTtl: true });
  }
  if (tokens.length) await redis.sadd(userSessionsKey(newName), tokens[0], ...tokens.slice(1));
  await redis.del(userSessionsKey(oldName));
  for (const [from, to] of [[loginLogKey(oldName), loginLogKey(newName)], [devicesKey(oldName), devicesKey(newName)]]) {
    if (await redis.exists(from)) await redis.rename(from, to);
  }
  return moved;
}

export async function logout(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const redis = getRedis();
    const d = await redis.get<SessionData>(sessionKey(token));
    await redis.del(sessionKey(token));
    if (d?.username) await redis.srem(userSessionsKey(d.username), token);
  }
  cookies().delete(SESSION_COOKIE);
}

/** How long this login has left (seconds), for the "you'll be logged out soon" warning. */
export async function sessionTimeLeft(): Promise<{ seconds: number; remember: boolean } | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const redis = getRedis();
  const [session, ttl] = await Promise.all([redis.get<SessionData>(sessionKey(token)), redis.ttl(sessionKey(token))]);
  if (!session?.username || ttl < 0) return null;
  return { seconds: ttl, remember: session.remember !== false };
}
/** "Stay logged in": start this login's clock again (same length as when you logged in). */
export async function extendSession(): Promise<number> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Log in first");
  const redis = getRedis();
  const session = await redis.get<SessionData>(sessionKey(token));
  if (!session?.username) throw new Error("Log in first");
  const remember = session.remember !== false;
  const ttl = remember ? SESSION_TTL_SECONDS : SHORT_SESSION_SECONDS;
  await redis.expire(sessionKey(token), ttl);
  setSessionCookie(token, remember);
  return ttl;
}

/** Returns the logged-in username, or null. */
export async function getCurrentUser(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const redis = getRedis();
  const session = await redis.get<SessionData>(sessionKey(token));
  if (!session?.username) return null;
  // account may have been deleted by an admin
  const exists = await redis.exists(userKey(session.username));
  if (!exists) return null;
  // self-heal the index for accounts created before it existed (once per server instance)
  const lower = session.username.toLowerCase();
  if (!indexed.has(lower)) {
    indexed.add(lower);
    redis.sadd(USER_INDEX, lower).catch(() => indexed.delete(lower));
  }
  return session.username;
}
const indexed = new Set<string>();

/**
 * Rebuild the user index by scanning every users:* key. Fixes accounts
 * created before the index existed (they can log in but weren't listed).
 */
export async function rebuildUserIndex(): Promise<number> {
  const redis = getRedis();
  const names: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: "users:*", count: 200 });
    cursor = next;
    for (const k of keys) {
      if (k === USER_INDEX) continue;
      names.push(k.slice("users:".length));
    }
  } while (cursor !== "0");
  if (names.length) await redis.sadd(USER_INDEX, names[0], ...names.slice(1));
  return names.length;
}

export async function listUsers(): Promise<{ username: string; createdAt: string }[]> {
  const redis = getRedis();
  const names = await redis.smembers(USER_INDEX);
  if (!names.length) return [];
  const users = await redis.mget<(StoredUser | null)[]>(...names.map(userKey));
  return users
    .filter((u): u is StoredUser => !!u)
    .map((u) => ({ username: u.username, createdAt: u.createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteUser(username: string): Promise<void> {
  const redis = getRedis();
  await logoutEverywhere(username);
  await redis.del(userKey(username), loginLogKey(username), devicesKey(username), userSessionsKey(username), pendingTotpKey(username));
  await redis.srem(USER_INDEX, username.toLowerCase());
}
