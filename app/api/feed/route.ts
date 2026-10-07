import { NextRequest, NextResponse } from "next/server";
import { getBookmarks, viewFor } from "@/lib/store";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The newest links as an RSS feed (default) or JSON Feed (?format=json). */
export async function GET(req: NextRequest) {
  try {
    await rateLimit(`feed:${clientIp(req)}`, 60, 60);
    const data = viewFor(await getBookmarks(), { admin: false, member: false });
    const origin = req.nextUrl.origin;
    const title = data.settings?.title || "Theo's Bookmarks";
    const items = data.folders
      .filter((f) => !f.archived)
      .flatMap((f) => f.links.filter((l) => l.createdAt).map((l) => ({ f, l })))
      .sort((a, b) => b.l.createdAt!.localeCompare(a.l.createdAt!))
      .slice(0, 50);
    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({
        version: "https://jsonfeed.org/version/1.1",
        title, home_page_url: origin, feed_url: `${origin}/api/feed?format=json`,
        items: items.map(({ f, l }) => ({
          id: l.id, url: l.url, title: l.name, content_text: l.notes || `New in ${f.emoji} ${f.name}`,
          date_published: l.createdAt, tags: [f.name, ...(l.tags || [])],
        })),
      }, { headers: { "Access-Control-Allow-Origin": "*" } });
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(title)}</title><link>${esc(origin)}</link><description>New websites on ${esc(title)}</description>
${items.map(({ f, l }) => `<item><title>${esc(l.name)}</title><link>${esc(l.url)}</link><guid isPermaLink="false">${esc(l.id)}</guid><pubDate>${new Date(l.createdAt!).toUTCString()}</pubDate><category>${esc(f.name)}</category><description>${esc(l.notes || `New in ${f.emoji} ${f.name}`)}</description></item>`).join("\n")}
</channel></rss>`;
    return new NextResponse(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    return errorResponse(e, 500);
  }
}
