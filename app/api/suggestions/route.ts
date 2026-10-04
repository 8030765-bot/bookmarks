import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { commentSuggestion, createSuggestion, listForUser, publicSuggestions, voteSuggestion } from "@/lib/suggestions";
import { errorResponse } from "@/lib/http";
import { cleanPostText, requireMember } from "@/lib/member";
import { assertWritable, getFlags, restriction } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** The logged-in user's own suggestions, newest first — or with ?public=1, the whole idea board. */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("public")) {
    try {
      return NextResponse.json({ suggestions: await publicSuggestions() });
    } catch (e: unknown) {
      return errorResponse(e);
    }
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ suggestions: [] });
  return NextResponse.json({ suggestions: await listForUser(user) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "vote" || body.action === "comment") {
      const me = await requireMember();
      await cleanPostText(body, ["text"]);
      await rateLimit(`suggest-talk:${me.user.toLowerCase()}`, 30, 60);
      if (body.action === "vote") await voteSuggestion(String(body.id || ""), me.user);
      else await commentSuggestion(String(body.id || ""), me.user, String(body.text || ""));
      return NextResponse.json({ suggestions: await publicSuggestions() });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in to suggest changes" }, { status: 401 });
    if ((await getFlags()).suggestionsEnabled === false) throw new Error("Suggestions are switched off right now");
    await assertWritable(null);
    const why = await restriction(user);
    if (why) throw new Error(why);
    await cleanPostText(body, ["note", "name", "description"]);
    await rateLimit(`suggest:${user.toLowerCase()}`, 15, 60);
    await createSuggestion(user, body);
    return NextResponse.json({ suggestions: await listForUser(user) });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
