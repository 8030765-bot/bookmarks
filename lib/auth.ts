import { Redis } from "@upstash/redis";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "bm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

interface Session {
  token: string;
  username: string;
}

interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
  /** hash of a one-time recovery code, for forgotten-password resets */
  recoveryHash?: string;
}

function genRecoveryCode(): string {
  // 12 hex chars, shown in groups of 4 — easy to write down
  return randomBytes(6).toString("hex");
}

function getRedis() {
  return Redis.fromEnv();
}

const USER_INDEX = "users:index";
const userKey = (username: string) => `users:${username.toLowerCase()}`;
const sessionKey = (token: string) => `sessions:${token}`;

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

export function validateCredentials(username: string, password: string) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error("Username must be 3–20 letters, numbers or _");
  }
  if (password.length < 6 || password.length > 100) {
    throw new Error("Password must be at least 6 characters");
  }
}

async function createSession(username: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  // stored as an object so all-digit usernames don't get auto-parsed into numbers
  await getRedis().set(sessionKey(token), { username }, { ex: SESSION_TTL_SECONDS });
  return token;
}

export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function signup(username: string, password: string): Promise<Session & { recoveryCode: string }> {
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
  return { token: await createSession(username), username, recoveryCode };
}

export async function login(username: string, password: string): Promise<Session> {
  const redis = getRedis();
  const failKey = `login_fail:${username.toLowerCase()}`;
  const fails = (await redis.get<number>(failKey)) || 0;
  if (fails >= 10) throw new Error("Too many attempts — try again in 15 minutes");
  const user = await redis.get<StoredUser>(userKey(username));
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await redis.incr(failKey);
    await redis.expire(failKey, 15 * 60);
    throw new Error("Wrong username or password");
  }
  await redis.del(failKey);
  // backfill: accounts created before the index existed get added on next login
  await redis.sadd(USER_INDEX, user.username.toLowerCase());
  return { token: await createSession(user.username), username: user.username };
}

/** Reset a forgotten password using the one-time recovery code. Returns a fresh code. */
export async function resetWithCode(username: string, code: string, newPassword: string): Promise<{ recoveryCode: string }> {
  if (newPassword.length < 6 || newPassword.length > 100) throw new Error("Password must be at least 6 characters");
  const redis = getRedis();
  const failKey = `reset_fail:${username.toLowerCase()}`;
  if (((await redis.get<number>(failKey)) || 0) >= 8) throw new Error("Too many attempts — try again in 15 minutes");
  const user = await redis.get<StoredUser>(userKey(username));
  const clean = code.trim().replace(/\s+/g, "").toLowerCase();
  if (!user || !user.recoveryHash || !verifyPassword(clean, user.recoveryHash)) {
    await redis.incr(failKey);
    await redis.expire(failKey, 15 * 60);
    throw new Error("Wrong username or recovery code");
  }
  const recoveryCode = genRecoveryCode();
  user.passwordHash = hashPassword(newPassword);
  user.recoveryHash = hashPassword(recoveryCode);
  await redis.set(userKey(user.username), user);
  await redis.del(failKey, `login_fail:${user.username.toLowerCase()}`);
  return { recoveryCode };
}

/** Logged-in password change (needs the current password). */
export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6 || newPassword.length > 100) throw new Error("New password must be at least 6 characters");
  const redis = getRedis();
  const user = await redis.get<StoredUser>(userKey(username));
  if (!user || !verifyPassword(oldPassword, user.passwordHash)) throw new Error("Current password is wrong");
  user.passwordHash = hashPassword(newPassword);
  await redis.set(userKey(user.username), user);
}

/** Generate a fresh recovery code for a logged-in account (e.g. old accounts that never had one). */
export async function regenerateRecoveryCode(username: string): Promise<string> {
  const redis = getRedis();
  const user = await redis.get<StoredUser>(userKey(username));
  if (!user) throw new Error("No such account");
  const recoveryCode = genRecoveryCode();
  user.recoveryHash = hashPassword(recoveryCode);
  await redis.set(userKey(user.username), user);
  return recoveryCode;
}

/** Admin reset: set a temporary password and return it to hand to the user. */
export async function adminSetPassword(username: string): Promise<{ username: string; tempPassword: string }> {
  const redis = getRedis();
  const user = await redis.get<StoredUser>(userKey(username));
  if (!user) throw new Error("No such account");
  const tempPassword = `reset-${randomBytes(3).toString("hex")}`;
  user.passwordHash = hashPassword(tempPassword);
  await redis.set(userKey(user.username), user);
  await redis.del(`login_fail:${user.username.toLowerCase()}`);
  return { username: user.username, tempPassword };
}

export async function logout(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await getRedis().del(sessionKey(token));
  cookies().delete(SESSION_COOKIE);
}

/** Returns the logged-in username, or null. */
export async function getCurrentUser(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const redis = getRedis();
  const session = await redis.get<{ username: string }>(sessionKey(token));
  if (!session?.username) return null;
  // account may have been deleted by an admin
  const exists = await redis.exists(userKey(session.username));
  if (!exists) return null;
  // self-heal the index for accounts created before it existed
  redis.sadd(USER_INDEX, session.username.toLowerCase()).catch(() => {});
  return session.username;
}

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
  await redis.del(userKey(username));
  await redis.srem(USER_INDEX, username.toLowerCase());
}
