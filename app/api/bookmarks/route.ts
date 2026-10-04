import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getBookmarks, handleAction, trackClick, viewFor, withClicks } from "@/lib/store";
import { AuthContext, audit, getAuthContext } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { accountInfo } from "@/lib/auth";
import { assertWritable, bumpStat, getFlags, inGroup, isFrozen, restriction } from "@/lib/moderation";
import { createSuggestion } from "@/lib/suggestions";
import { BookmarksData } from "@/lib/types";

export const dynamic = "force-dynamic";

// everyday actions that don't belong in the admin audit log
const NOT_AUDITED = new Set(["trackClick", "toggleFavorite", "toggleLike", "votePoll", "verifyAdmin", "addLink", "addLinks", "addFolder"]);
// things muted, timed-out or frozen people can still do
const ALWAYS_OK = new Set(["trackClick", "toggleFavorite", "verifyAdmin"]);
const SOCIAL = new Set(["toggleLike", "votePoll"]);

const isAdminCtx = (ctx: AuthContext) => ctx.role === "owner" || ctx.role === "admin";
/** The list as this person may see it. */
async function shown(data: BookmarksData, ctx: AuthContext, asMember = false) {
  return withClicks(viewFor(data, { admin: isAdminCtx(ctx) && !asMember, member: !!ctx.user }));
}

export async function GET(req: NextRequest) {
  try {
    const [data, ctx] = await Promise.all([getBookmarks(), getAuthContext()]);
    // older clients poll with ?rev=N: skip the full payload when nothing changed
    const since = req.nextUrl.searchParams.get("rev");
    if (since !== null && Number(since) === (data.rev || 0)) {
      return NextResponse.json({ unchanged: true, rev: data.rev || 0 });
    }
    // admins can preview the site the way members see it
    return NextResponse.json(await shown(data, ctx, req.nextUrl.searchParams.get("asMember") === "1"));
  } catch (e: unknown) {
    return errorResponse(e, 500);
  }
}

/** Members' links that need an admin's OK first ("approve new links" or brand-new accounts). */
async function needsApproval(ctx: AuthContext, folderId: string) {
  if (!ctx.user || isAdminCtx(ctx) || ctx.contributor) return null;
  const flags = await getFlags();
  let reason: string | null = null;
  if (flags.approveLinks) reason = "New links are checked by an admin first";
  else if (flags.newAccountWait) {
    const info = await accountInfo(ctx.user).catch(() => null);
    if (info?.createdAt && Date.now() - Date.parse(info.createdAt) < 86400_000) reason = "New accounts can suggest links for their first day";
  }
  if (!reason) return null;
  // a folder's maintainers can always add to it
  const folder = (await getBookmarks()).folders.find((f) => f.id === folderId);
  if (folder?.maintainers?.includes(ctx.user.toLowerCase())) return null;
  return reason;
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
      await bumpStat("clicks");
      return NextResponse.json({ ok: true });
    }
    // never trust a client-supplied identity — rebuild it from the session
    delete body.__user;
    delete body.__auth;
    const ctx: AuthContext = await getAuthContext();
    await rateLimit(`write:${ctx.user?.toLowerCase() || ip}`, 60, 60);

    if (!ALWAYS_OK.has(action)) await assertWritable(ctx.role);
    if (ctx.user && !isAdminCtx(ctx) && !ALWAYS_OK.has(action)) {
      const [why, frozen] = await Promise.all([restriction(ctx.user), isFrozen(ctx.user)]);
      if (why) throw new Error(why);
      if (frozen && !SOCIAL.has(action)) throw new Error("A moderator has paused your edits for now");
    }
    ctx.contributor = !!ctx.user && (await inGroup("contributors", ctx.user));
    body.__auth = ctx;

    if (action === "addLinks" || action === "addLink") {
      const reason = await needsApproval(ctx, String(body.folderId || ""));
      if (reason) {
        if (action === "addLinks") throw new Error(`${reason} — add them one at a time so each can be checked`);
        await createSuggestion(ctx.user!, { kind: "addLink", name: body.name, url: body.url, folderId: body.folderId, note: body.notes });
        return NextResponse.json({ ...(await shown(await getBookmarks(), ctx)), queued: `${reason} — yours is waiting for approval` });
      }
    }

    // retries of the same change (flaky Wi-Fi) are applied only once
    const opId = typeof body.opId === "string" && /^[a-z0-9-]{8,64}$/i.test(body.opId) ? body.opId : null;
    if (opId) {
      opKey = `op:${opId}`;
      const fresh = await Redis.fromEnv().set(opKey, 1, { nx: true, ex: 300 });
      if (!fresh) {
        opKey = null;
        return NextResponse.json(await shown(await getBookmarks(), ctx));
      }
    }

    // handleAction ALWAYS returns full BookmarksData with folders array
    const data = await handleAction(action, body);
    if (action === "addLink") await bumpStat("links");
    if (action === "addLinks") await bumpStat("links", Math.max(1, Array.isArray(body.links) ? body.links.length : 1));
    if (!NOT_AUDITED.has(action)) {
      const detail = data.activity?.[0]?.detail;
      await audit(ctx, action, detail).catch(() => {});
    }
    return NextResponse.json(await shown(data, ctx));
  } catch (e: unknown) {
    // the change failed, so a retry with the same id should be allowed to run
    if (opKey) await Redis.fromEnv().del(opKey).catch(() => {});
    // our own checks explain what was wrong with the request (400); only
    // network/database trouble or the overwrite guard are real server errors
    const message = e instanceof Error ? e.message : "";
    const serverFault = !message || /fetch failed|ECONN|ETIMEDOUT|socket|network|Upstash|Refusing to overwrite|Unexpected token/i.test(message);
    return errorResponse(e, serverFault ? 500 : 400);
  }
}
