import { NextRequest, NextResponse } from "next/server";
import { changePassword, getCurrentUser, regenerateRecoveryCode } from "@/lib/auth";
import { normalizeUrl } from "@/lib/url";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import {
  addMyStuff, getUserData, markNotificationsRead, recordAggregateRating, removeMyStuff,
  deleteView, saveView, setFolderOrder, setFolderPref, setLinkPref, setProfile, setRating, toggleFavorite,
} from "@/lib/userdata";
import { Redis } from "@upstash/redis";
import { followersKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  const data = await getUserData(user);
  return NextResponse.json({ user, ...data });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in first" }, { status: 401 });
    await rateLimit(`me:${user.toLowerCase()}`, 120, 60);
    const body = await req.json();
    switch (String(body.action || "")) {
      case "profile":
        return NextResponse.json({ profile: await setProfile(user, body.profile || {}) });
      case "favorite":
        return NextResponse.json({ favorites: await toggleFavorite(user, String(body.linkId || "")) });
      case "rate": {
        const linkId = String(body.linkId || "");
        const stars = Number(body.stars);
        const before = (await getUserData(user)).ratings[linkId];
        const ratings = await setRating(user, linkId, stars);
        await recordAggregateRating(linkId, before, ratings[linkId]);
        return NextResponse.json({ ratings });
      }
      case "addMyStuff": {
        const name = String(body.name || "").trim();
        const url = normalizeUrl(String(body.url || ""));
        if (!name || !url) throw new Error("Add a name and a link");
        return NextResponse.json({ myStuff: await addMyStuff(user, name, url) });
      }
      case "removeMyStuff":
        return NextResponse.json({ myStuff: await removeMyStuff(user, String(body.id || "")) });
      case "folderPref": {
        const folderId = String(body.folderId || "");
        const patch = (body.patch || {}) as Record<string, unknown>;
        const folders = await setFolderPref(user, folderId, patch);
        // followers are also kept in a set per folder, so adding a link can notify them cheaply
        if (typeof patch.follow === "boolean") {
          const redis = Redis.fromEnv();
          if (patch.follow) await redis.sadd(followersKey(folderId), user.toLowerCase());
          else await redis.srem(followersKey(folderId), user.toLowerCase());
        }
        return NextResponse.json({ folders });
      }
      case "folderOrder":
        return NextResponse.json({ folderOrder: await setFolderOrder(user, body.order) });
      case "saveView":
        return NextResponse.json({ views: await saveView(user, (body.view || {}) as Record<string, unknown>) });
      case "deleteView":
        return NextResponse.json({ views: await deleteView(user, String(body.id || "")) });
      case "linkPref":
        return NextResponse.json({ links: await setLinkPref(user, String(body.linkId || ""), (body.patch || {}) as Record<string, unknown>) });
      case "readNotifications":
        await markNotificationsRead(user);
        return NextResponse.json({ ok: true });
      case "changePassword":
        await changePassword(user, String(body.oldPassword || ""), String(body.newPassword || ""));
        return NextResponse.json({ ok: true });
      case "newRecoveryCode":
        return NextResponse.json({ recoveryCode: await regenerateRecoveryCode(user) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
