import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSuggestion, listForUser } from "@/lib/suggestions";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** The logged-in user's own suggestions, newest first. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ suggestions: [] });
  return NextResponse.json({ suggestions: await listForUser(user) });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in to suggest changes" }, { status: 401 });
    await rateLimit(`suggest:${user.toLowerCase()}`, 15, 60);
    await createSuggestion(user, await req.json());
    return NextResponse.json({ suggestions: await listForUser(user) });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
