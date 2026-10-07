import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isQuotaError } from "@/lib/http";

export const dynamic = "force-dynamic";

const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

/** Is the site up, and can it reach its database? Used by the /status page. */
export async function GET() {
  const started = Date.now();
  const base = { version: VERSION, region: process.env.VERCEL_REGION || "local", time: new Date().toISOString() };
  try {
    const rev = await Redis.fromEnv().get<number>("rev:bookmarks");
    return NextResponse.json(
      { ok: true, db: "ok", dbMs: Date.now() - started, rev: Number(rev || 0), ...base },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unreachable";
    return NextResponse.json(
      { ok: false, db: isQuotaError(message) ? "quota" : "down", error: message.slice(0, 200), dbMs: Date.now() - started, ...base },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
