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

export async function signup(username: string, password: string): Promise<Session> {
  validateCredentials(username, password);
  const user: StoredUser = {
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  // nx: only create if the username isn't taken (case-insensitive)
  const created = await getRedis().set(userKey(username), user, { nx: true });
  if (!created) throw new Error("That username is already taken");
  await getRedis().sadd(USER_INDEX, username.toLowerCase());
  return { token: await createSession(username), username };
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
  return { token: await createSession(user.username), username: user.username };
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
  return exists ? session.username : null;
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
