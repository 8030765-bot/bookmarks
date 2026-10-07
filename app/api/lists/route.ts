import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/auth";
import { getAuthContext } from "@/lib/roles";
import { getPublicList } from "@/lib/userdata";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Someone's shared My Stuff folder. Only for people who are logged in —
 * these links weren't checked like the shared list, so they stay inside
 * the class (and can be reported).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx.user) return NextResponse.json({ error: "Log in to see lists people have shared" }, { status: 401 });
    const user = (req.nextUrl.searchParams.get("user") || "").trim();
    const list = (req.nextUrl.searchParams.get("list") || "").trim();
    const match = (await listUsers()).find((u) => u.username.toLowerCase() === user.toLowerCase());
    if (!match || !list) return NextResponse.json({ error: "No such list" }, { status: 404 });
    const links = await getPublicList(match.username, list);
    if (!links) return NextResponse.json({ error: "That list isn't shared (any more)" }, { status: 404 });
    return NextResponse.json({ user: match.username, list, links, mine: match.username.toLowerCase() === ctx.user.toLowerCase() });
  } catch (e) {
    return errorResponse(e);
  }
}
