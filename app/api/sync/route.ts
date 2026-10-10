import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { REV_KEYS, userRevKey } from "@/lib/revs";
import { getBookmarks } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * The one thing every open page polls. Returns the change counters for
 * shared data (and the caller's own account) in a single MGET, so pages
 * only re-download what actually changed. The counters aren't secret —
 * the data behind them still needs the normal endpoints (and login).
 */
export async function GET(req: NextRequest) {
  try {
    const u = (req.nextUrl.searchParams.get("u") || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    const redis = Redis.fromEnv();
    const keys = [REV_KEYS.bookmarks, REV_KEYS.chat, REV_KEYS.ratings, REV_KEYS.suggestions, REV_KEYS.faces, ...(u ? [userRevKey(u)] : [])];
    const vals = await redis.mget<(number | string | null)[]>(...keys);
    let bookmarks = vals[0];
    if (bookmarks === null) {
      // first poll after this feature shipped: seed the counter from the saved list
      bookmarks = (await getBookmarks()).rev || 0;
      await redis.set(REV_KEYS.bookmarks, bookmarks);
    }
    const n = (v: number | string | null | undefined) => Number(v || 0);
    return NextResponse.json(
      {
        bookmarks: n(bookmarks),
        chat: n(vals[1]),
        ratings: n(vals[2]),
        suggestions: n(vals[3]),
        faces: n(vals[4]),
        user: u ? n(vals[5]) : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return errorResponse(e, 500);
  }
}
