import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, listEvents, saveEvent } from "@/lib/community";
import { errorResponse } from "@/lib/http";
import { audit, checkMod, getAuthContext } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** The community calendar: anyone can see it, moderators keep it up to date. */
export async function GET() {
  try {
    return NextResponse.json({ events: await listEvents() });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ctx = await getAuthContext();
    checkMod(ctx, typeof body.password === "string" ? body.password : undefined);
    if (body.action === "delete") {
      await deleteEvent(String(body.id || ""));
      await audit(ctx, "deleteEvent", String(body.id || "")).catch(() => {});
    } else {
      const e = await saveEvent(ctx.user || "admin", body);
      await audit(ctx, "saveEvent", e.title).catch(() => {});
    }
    return NextResponse.json({ events: await listEvents() });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
