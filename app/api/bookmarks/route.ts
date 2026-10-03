import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getBookmarks, handleAction, trackClick, withClicks } from "@/lib/store";
import { audit, getAuthContext } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// everyday actions that don't belong in the admin audit log
const NOT_AUDITED = new Set(["trackClick", "toggleFavorite", "toggleLike", "votePoll", "verifyAdmin", "addLink", "addFolder"]);

export async function GET(req: NextRequest) {
  try {
    const data = await getBookmarks();
    // older clients poll with ?rev=N: skip the full payload when nothing changed
    const since = req.nextUrl.searchParams.get("rev");
    if (since !== null && Number(since) === (data.rev || 0)) {
      return NextResponse.json({ unchanged: true, rev: data.rev || 0 });
    }
    return NextResponse.json(await withClicks(data));
  } catch (e: unknown) {
    return errorResponse(e, 500);
  }
}

export async function POST(req: NextRequest) {
  let opKey: string | null = null;
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }
    const ip = clientIp(req);
    if (action === "trackClick") {
      // visits are fire-and-forget and never touch the shared list
      await rateLimit(`click:${ip}`, 120, 60);
      await trackClick(String(body.linkId || ""));
      return NextResponse.json({ ok: true });
    }
    // never trust a client-supplied identity — rebuild it from the session
    delete body.__user;
    delete body.__auth;
    const ctx = await getAuthContext();
    body.__auth = ctx;
    await rateLimit(`write:${ctx.user?.toLowerCase() || ip}`, 60, 60);

    // retries of the same change (flaky Wi-Fi) are applied only once
    const opId = typeof body.opId === "string" && /^[a-z0-9-]{8,64}$/i.test(body.opId) ? body.opId : null;
    if (opId) {
      opKey = `op:${opId}`;
      const fresh = await Redis.fromEnv().set(opKey, 1, { nx: true, ex: 300 });
      if (!fresh) {
        opKey = null;
        return NextResponse.json(await withClicks(await getBookmarks()));
      }
    }

    // handleAction ALWAYS returns full BookmarksData with folders array
    const data = await handleAction(action, body);
    if (!NOT_AUDITED.has(action)) {
      const detail = data.activity?.[0]?.detail;
      await audit(ctx, action, detail).catch(() => {});
    }
    return NextResponse.json(await withClicks(data));
  } catch (e: unknown) {
    // the change failed, so a retry with the same id should be allowed to run
    if (opKey) await Redis.fromEnv().del(opKey).catch(() => {});
    const message = e instanceof Error ? e.message : "";
    const known = message === "Unknown action" || message.startsWith("Missing") || message.includes("not found") ||
      message.includes("Invalid") || message.includes("closed") || message.startsWith("A poll") ||
      message.startsWith("No web links") || message.includes("URL") || message.includes("link") || message.startsWith("Name");
    return errorResponse(e, known ? 400 : 500);
  }
}
