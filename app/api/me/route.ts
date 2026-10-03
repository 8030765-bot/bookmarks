import { NextRequest, NextResponse } from "next/server";
import { changePassword, getCurrentUser, regenerateRecoveryCode } from "@/lib/auth";
import { normalizeUrl } from "@/lib/url";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import {
  addMyStuff, getUserData, markNotificationsRead, recordAggregateRating, removeMyStuff,
  setProfile, setRating, toggleFavorite,
} from "@/lib/userdata";

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
