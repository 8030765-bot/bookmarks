import { Redis } from "@upstash/redis";
import { getCurrentUser } from "./auth";

export type Role = "owner" | "admin" | "mod";
const ROLES_KEY = "roles"; // hash: lowercase username -> role
const AUDIT_KEY = "audit";
const AUDIT_MAX = 300;

function getRedis() {
  return Redis.fromEnv();
}

export async function getRole(username: string | null | undefined): Promise<Role | null> {
  if (!username) return null;
  const role = await getRedis().hget<string>(ROLES_KEY, username.toLowerCase());
  return role === "owner" || role === "admin" || role === "mod" ? role : null;
}

export async function listRoles(): Promise<Record<string, Role>> {
  return ((await getRedis().hgetall<Record<string, Role>>(ROLES_KEY)) || {}) as Record<string, Role>;
}

export async function ownerExists(): Promise<boolean> {
  return Object.values(await listRoles()).includes("owner");
}

export async function setRole(username: string, role: Role | null) {
  const key = username.toLowerCase();
  if (role) await getRedis().hset(ROLES_KEY, { [key]: role });
  else await getRedis().hdel(ROLES_KEY, key);
}

/** Who is asking, and what they're allowed to do. Computed server-side only. */
export interface AuthContext {
  user: string | null;
  role: Role | null;
  ownerExists: boolean;
}
export async function getAuthContext(): Promise<AuthContext> {
  const user = await getCurrentUser();
  const [role, hasOwner] = await Promise.all([getRole(user), ownerExists()]);
  return { user, role, ownerExists: hasOwner };
}

/**
 * Admin check. Accounts with the owner/admin role always pass. The shared
 * ADMIN_PASSWORD only works until someone has claimed the owner role —
 * after that it's retired, so a leaked password can't be used.
 */
export function checkAdmin(ctx: Partial<AuthContext> | undefined, password?: string) {
  if (ctx?.role === "owner" || ctx?.role === "admin") return;
  if (ctx?.ownerExists) throw new Error("Admins only — log in with an admin account");
  checkPassword(password);
}

/** Moderators can moderate chat, comments, suggestions and reports, but not edit bookmarks. */
export function checkMod(ctx: Partial<AuthContext> | undefined, password?: string) {
  if (ctx?.role === "mod") return;
  checkAdmin(ctx, password);
}

export function checkOwner(ctx: Partial<AuthContext> | undefined) {
  if (ctx?.role !== "owner") throw new Error("Only the owner can do that");
}

export function checkPassword(password?: string) {
  const expected = process.env.ADMIN_PASSWORD || process.env.BOOKMARKS_ADMIN_PASSWORD || "";
  if (!expected) {
    // Fail closed: previews share the live database, so a deployment without a
    // password must not hand admin to everyone.
    throw new Error("Admin is disabled here — set ADMIN_PASSWORD for this environment in Vercel");
  }
  if (!password || password !== expected) throw new Error("Wrong admin password");
}

/* ---------- audit log ---------- */
export interface AuditEntry {
  at: string;
  actor: string;
  role: string;
  action: string;
  detail?: string;
}

export async function audit(ctx: Partial<AuthContext>, action: string, detail?: string) {
  const entry: AuditEntry = {
    at: new Date().toISOString(),
    actor: ctx.user || "(shared password)",
    role: ctx.role || (ctx.user ? "user" : "password"),
    action,
    detail: detail?.slice(0, 200),
  };
  const redis = getRedis();
  await redis.lpush(AUDIT_KEY, entry);
  await redis.ltrim(AUDIT_KEY, 0, AUDIT_MAX - 1);
}

export async function listAudit(): Promise<AuditEntry[]> {
  return getRedis().lrange<AuditEntry>(AUDIT_KEY, 0, AUDIT_MAX - 1);
}

/** Errors that mean "not allowed" rather than "bad request". */
export function isAuthError(message: string) {
  return (
    message === "Wrong admin password" ||
    message.startsWith("Admin is disabled") ||
    message.startsWith("Admins only") ||
    message.startsWith("Only the owner")
  );
}
