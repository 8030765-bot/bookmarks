import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { requireMember } from "@/lib/member";
import { rateLimit } from "@/lib/ratelimit";
import { define, getToolData, setToolData, submitTyping, typingBoard } from "@/lib/tools";

export const dynamic = "force-dynamic";

/**
 * Tools drawer: ?data=1 your saved notes/to-dos/habits/flashcards/countdowns,
 * ?typing=1 the typing leaderboard, ?define=word a dictionary lookup.
 */
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    if (p.get("typing")) return NextResponse.json({ board: await typingBoard() });
    const word = p.get("define");
    if (word !== null) {
      const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
      await rateLimit(`define:${ip}`, 30, 60);
      return NextResponse.json({ entry: await define(word) });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ data: null });
    return NextResponse.json({ data: await getToolData(user) });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "typing") {
      const me = await requireMember();
      await rateLimit(`typing:${me.user.toLowerCase()}`, 10, 60);
      const res = await submitTyping(me.user, body);
      return NextResponse.json({ ...res, board: await typingBoard() });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in to save your tools to your account" }, { status: 401 });
    await rateLimit(`tools:${user.toLowerCase()}`, 60, 60);
    await setToolData(user, String(body.tool || ""), body.value);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
