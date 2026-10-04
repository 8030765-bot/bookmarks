import { NextRequest, NextResponse } from "next/server";
import { deleteWiki, getWiki, listWiki, saveWiki } from "@/lib/community";
import { errorResponse } from "@/lib/http";
import { cleanPostText, requireCommunityOpen, requireMember } from "@/lib/member";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** The how-to wiki: GET ?slug= for one page (with its history), or the list of pages. */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (slug) {
      const page = await getWiki(slug);
      if (!page) return NextResponse.json({ error: "No page with that name yet" }, { status: 404 });
      return NextResponse.json({ page });
    }
    return NextResponse.json({ pages: await listWiki() });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const me = await requireMember();
    await requireCommunityOpen(me.staff);
    await cleanPostText(body, ["title", "body"]);
    if (body.action === "delete") {
      if (!me.staff) throw new Error("Admins only — ask a moderator to remove a page");
      await deleteWiki(String(body.slug || ""));
      await audit(me, "deleteWiki", String(body.slug || "")).catch(() => {});
      return NextResponse.json({ pages: await listWiki() });
    }
    await rateLimit(`wiki:${me.user.toLowerCase()}`, 10, 60);
    const page = await saveWiki(me.user, body, me.staff);
    return NextResponse.json({ page });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
