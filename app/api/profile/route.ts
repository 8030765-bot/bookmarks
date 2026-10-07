import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/auth";
import { earnedBadges } from "@/lib/badges";
import { getAuthContext } from "@/lib/roles";
import { getRole } from "@/lib/roles";
import { getBookmarks } from "@/lib/store";
import { getUserData, liveProfile } from "@/lib/userdata";
import { lastSeenFor, socialCounts } from "@/lib/social";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A person's public profile page (respects who they let see it). */
export async function GET(req: NextRequest) {
  try {
    const username = (req.nextUrl.searchParams.get("user") || "").trim();
    if (!username) return NextResponse.json({ error: "Missing user" }, { status: 400 });
    const users = await listUsers();
    const match = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!match) return NextResponse.json({ username: null });
    const ctx = await getAuthContext();
    const viewer = ctx.user;
    const self = viewer?.toLowerCase() === match.username.toLowerCase();
    const staff = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";
    const [ud, role, data, social, seen] = await Promise.all([
      getUserData(match.username), getRole(match.username), getBookmarks(), socialCounts(match.username, viewer), lastSeenFor(viewer),
    ]);
    const profile = liveProfile(ud.profile);
    if (profile.visibility === "private" && !self && !staff) {
      return NextResponse.json({ username: match.username, hidden: true });
    }
    if (profile.visibility === "members" && !viewer) {
      return NextResponse.json({ username: match.username, membersOnly: true });
    }
    const lower = match.username.toLowerCase();
    let added = 0;
    let likesReceived = 0;
    const mine: { id: string; name: string; url: string; folder: string; emoji: string; createdAt?: string }[] = [];
    const byId = new Map<string, { id: string; name: string; url: string; folder: string; emoji: string }>();
    for (const f of data.folders) {
      for (const l of f.links) {
        byId.set(l.id, { id: l.id, name: l.name, url: l.url, folder: f.name, emoji: f.emoji });
        if (l.addedBy?.toLowerCase() === lower) {
          added++;
          likesReceived += l.likes?.length || 0;
          mine.push({ id: l.id, name: l.name, url: l.url, folder: f.name, emoji: f.emoji, createdAt: l.createdAt });
        }
      }
    }
    const recent = mine.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 6);
    const showcase = (profile.showcase || []).map((id) => byId.get(id)).filter(Boolean);
    const folderNames = new Map(data.folders.map((f) => [f.id, f]));
    const favFolders = Object.entries(ud.folders)
      .filter(([id, p]) => p.fav && folderNames.has(id))
      .map(([id]) => ({ id, name: folderNames.get(id)!.name, emoji: folderNames.get(id)!.emoji }))
      .slice(0, 6);
    // your own page also shows what you've been up to
    const activity = self ? (data.activity || []).filter((a) => a.by?.toLowerCase() === lower).slice(0, 15) : undefined;
    const signupRank = [...users].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).findIndex((u) => u.username === match.username);
    const badges = earnedBadges({
      added, likes: likesReceived, kudos: social.kudos, followers: social.followers, ratings: Object.keys(ud.ratings).length,
      signupRank, joined: match.createdAt, role,
    });
    // waiting pictures are only for their owner; the rest of the privacy settings too
    const { visibility, hideOnline, lastSeenTo, picPending, bannerPending, ...shown } = profile;
    const pinned = (profile.badges || []).filter((b) => badges.includes(b));
    return NextResponse.json({
      username: match.username,
      profile: self ? profile : { ...shown, picGif: viewer ? shown.picGif : undefined, badges: pinned.length ? pinned : undefined },
      badges,
      // shared My Stuff folders are for people who are logged in
      lists: viewer ? ud.publicLists || [] : undefined,
      role,
      joined: match.createdAt,
      added,
      likesReceived,
      social,
      lastSeen: hideOnline ? undefined : seen[lower],
      recent,
      showcase,
      favFolders,
      activity,
      self,
      visibility: self ? visibility || "everyone" : undefined,
    });
  } catch (e) {
    return errorResponse(e, 500);
  }
}
