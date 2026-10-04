import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { ratePage, sendFeedback } from "@/lib/feedback";
import { filterWords } from "@/lib/moderation";

export const dynamic = "force-dynamic";

/** Bug reports, messages to the admins, and the quick face on each page. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = await getCurrentUser();
    const who = user?.toLowerCase() || clientIp(req);
    if (body.kind === "rating") {
      await rateLimit(`pagerate:${who}`, 20, 60 * 60);
      await ratePage(String(body.page || "/"), String(body.value || ""));
      return NextResponse.json({ ok: true });
    }
    await rateLimit(`feedback:${who}`, 5, 60 * 60);
    if (typeof body.text === "string") body.text = await filterWords(body.text);
    await sendFeedback(user, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
