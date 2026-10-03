import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { normalizeUrl } from "@/lib/url";
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
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
