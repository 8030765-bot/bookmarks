import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import { getFlags } from "./moderation";

// tests run everything from one address, so they scale the limits up
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

/**
 * Fixed-window limiter: at most `max` calls per `windowSec` for one id.
 * Costs two tiny Redis commands, so it's only used on writes.
 */
export async function rateLimit(id: string, max: number, windowSec: number) {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${id}:${bucket}`;
  const redis = Redis.fromEnv();
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSec + 5);
  // admins can make every limit stricter or looser (Admin → Site)
  const siteScale = Math.max(0.25, Math.min(5, (await getFlags().catch(() => ({ rateScale: 1 }))).rateScale || 1));
  if (n > Math.max(1, Math.round(max * siteScale)) * SCALE) throw new Error("Slow down — too many requests. Try again in a minute.");
}

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
