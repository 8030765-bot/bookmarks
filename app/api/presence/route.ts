import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const KEY = "presence"; // sorted set: member -> last-seen ms
const WINDOW_MS = 45_000;

/**
 * Heartbeat: the page posts every ~20s with a random per-tab id.
 * Logged-in visitors are counted by name so several tabs count once.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tab = String(body.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
    const user = await getCurrentUser();
    const member = user ? `u:${user}` : tab ? `a:${tab}` : "";
    const redis = Redis.fromEnv();
    const now = Date.now();
    if (member) await redis.zadd(KEY, { score: now, member });
    await redis.zremrangebyscore(KEY, 0, now - WINDOW_MS);
    const members = await redis.zrange<string[]>(KEY, 0, -1);
    const users = members.filter((m) => m.startsWith("u:")).map((m) => m.slice(2)).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ count: members.length, users });
  } catch {
    return NextResponse.json({ count: 0, users: [] });
  }
}
