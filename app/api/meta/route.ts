import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { Redis } from "@upstash/redis";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { PageInfo, readPageInfo, safeFetchText } from "@/lib/safefetch";
import { normalizeUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
const CACHE_SECONDS = 7 * 24 * 3600;

/**
 * Title, description and reading time for a web page — fills in the
 * "Add a website" form. Logged-in only, rate-limited, cached for a week.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in to look up websites" }, { status: 401 });
    const url = normalizeUrl(req.nextUrl.searchParams.get("url") || "");
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
    const redis = Redis.fromEnv();
    const cacheKey = `meta:${createHash("sha1").update(url).digest("hex")}`;
    const cached = await redis.get<PageInfo & { status: number }>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cached: true });
    await rateLimit(`meta:${user.toLowerCase()}`, 30, 60);
    const page = await safeFetchText(url);
    const info = { ...readPageInfo(page.text, page.url), status: page.status, finalUrl: page.url };
    await redis.set(cacheKey, info, { ex: CACHE_SECONDS });
    return NextResponse.json(info);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/abort|timeout/i.test(message)) return NextResponse.json({ error: "That website took too long to answer" }, { status: 504 });
    return errorResponse(e);
  }
}
