import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { listUsers } from "@/lib/auth";
import { getAuthContext, listRoles } from "@/lib/roles";
import { getBookmarks } from "@/lib/store";
import { Profile, liveProfile } from "@/lib/userdata";
import { kudosAll, lastSeenAll } from "@/lib/social";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Member directory: everyone who hasn't hidden their profile, with a few stats. */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    const [users, roles, data, seen, kudos] = await Promise.all([listUsers(), listRoles(), getBookmarks(), lastSeenAll(), kudosAll()]);
    const redis = Redis.fromEnv();
    const blobs = users.length
      ? await redis.mget<({ profile?: Profile } | null)[]>(...users.map((u) => `userdata:${u.username.toLowerCase()}`))
      : [];
    const added = new Map<string, number>();
    for (const f of data.folders) for (const l of f.links) {
      const k = l.addedBy?.toLowerCase();
      if (k) added.set(k, (added.get(k) || 0) + 1);
    }
    const people = users
      .map((u, i) => {
        const p = liveProfile(blobs[i]?.profile || {});
        const k = u.username.toLowerCase();
        if (p.visibility === "private" || (p.visibility === "members" && !ctx.user)) return null;
        return {
          username: u.username,
          displayName: p.displayName,
          avatar: p.avatar,
          color: p.color,
          border: p.border,
          status: p.status,
          statusEmoji: p.statusEmoji,
          into: p.into,
          role: roles[k] || null,
          joined: u.createdAt,
          added: added.get(k) || 0,
          kudos: kudos[k] || 0,
          lastSeen: p.hideOnline ? undefined : seen[k],
        };
      })
      .filter(Boolean);
    return NextResponse.json({ people });
  } catch (e) {
    return errorResponse(e, 500);
  }
}
