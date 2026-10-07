import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireMember } from "@/lib/member";
import { createReport } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Report a link, chat message, post or person to the moderators. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const me = await requireMember();
    await rateLimit(`report:${me.user.toLowerCase()}`, 10, 60 * 10);
    await createReport(me.user, body);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
