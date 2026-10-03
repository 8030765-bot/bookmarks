import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getCurrentUser } from "@/lib/auth";
import { HIDE_ONLINE_KEY, touchLastSeen } from "@/lib/social";

export const dynamic = "force-dynamic";

const KEY = "presence"; // sorted set: member -> last-seen ms
const WINDOW_MS = 45_000;

/**
 * Heartbeat: the page posts every ~20s with a random per-tab id.
 * Logged-in visitors are counted by name so several tabs count once —
 * unless they've hidden their online status, then they count as a guest.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tab = String(body.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
    const user = await getCurrentUser();
    const redis = Redis.fromEnv();
    const hidden = user ? !!(await redis.sismember(HIDE_ONLINE_KEY, user.toLowerCase())) : false;
    const member = user && !hidden ? `u:${user}` : tab ? `a:${tab}` : "";
    const now = Date.now();
    if (member) await redis.zadd(KEY, { score: now, member });
    if (user && !hidden) await touchLastSeen(user);
    await redis.zremrangebyscore(KEY, 0, now - WINDOW_MS);
    const members = await redis.zrange<string[]>(KEY, 0, -1);
    const users = members.filter((m) => m.startsWith("u:")).map((m) => m.slice(2)).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ count: members.length, users });
  } catch {
    return NextResponse.json({ count: 0, users: [] });
  }
}
