import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { listUsers } from "@/lib/auth";
import { getAuthContext } from "@/lib/roles";
import { Profile, liveProfile } from "@/lib/userdata";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * What to show next to everyone's name — picture or emoji, colour, ring,
 * display name, away/busy — in one small download, so chat, boards and
 * link cards don't each fetch profiles. Private profiles show just a letter.
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    const users = await listUsers();
    const blobs = users.length
      ? await Redis.fromEnv().mget<({ profile?: Profile } | null)[]>(...users.map((u) => `userdata:${u.username.toLowerCase()}`))
      : [];
    const faces: Record<string, Record<string, string>> = {};
    users.forEach((u, i) => {
      const p = liveProfile(blobs[i]?.profile || {});
      if (p.visibility === "private" || (p.visibility === "members" && !ctx.user)) return;
      const f: Record<string, string | undefined> = {
        a: p.avatar, c: p.color, b: p.border, n: p.displayName, p: p.pic,
        // the moving version is for people who are logged in
        g: ctx.user ? p.picGif : undefined,
        v: p.availability, s: p.status ? `${p.statusEmoji || ""} ${p.status}`.trim() : undefined,
        d: p.birthday,
      };
      const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;
      if (Object.keys(clean).length) faces[u.username.toLowerCase()] = clean;
    });
    return NextResponse.json({ faces }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e, 500);
  }
}
