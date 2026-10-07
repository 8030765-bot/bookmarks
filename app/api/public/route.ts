import { NextRequest, NextResponse } from "next/server";
import { getBookmarks, viewFor, withClicks } from "@/lib/store";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Read-only JSON for other apps and the embeddable folder widget: what a
 * visitor who isn't logged in can see (no members-only folders, no
 * scheduled links, no names of who added what). ?folder=<id> for one folder.
 */
export async function GET(req: NextRequest) {
  try {
    await rateLimit(`public:${clientIp(req)}`, 120, 60);
    const data = viewFor(await withClicks(await getBookmarks()), { admin: false, member: false });
    const want = req.nextUrl.searchParams.get("folder");
    const folders = data.folders
      .filter((f) => !f.archived && (!want || f.id === want))
      .map((f) => ({
        id: f.id, name: f.name, emoji: f.emoji, description: f.description, parentId: f.parentId,
        links: f.links.map((l) => ({ id: l.id, name: l.name, url: l.url, tags: l.tags || [], description: l.notes, addedAt: l.createdAt, visits: l.clicks || 0 })),
      }));
    if (want && !folders.length) return NextResponse.json({ error: "No such folder" }, { status: 404 });
    return NextResponse.json(
      { title: data.settings?.title || "Theo's Bookmarks", updatedAt: data.updatedAt, folders },
      { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } },
    );
  } catch (e) {
    return errorResponse(e, 500);
  }
}
