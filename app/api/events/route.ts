import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, listEvents, saveEvent } from "@/lib/community";
import { errorResponse } from "@/lib/http";
import { audit, checkMod, getAuthContext } from "@/lib/roles";
import { modCan } from "@/lib/moderation";

export const dynamic = "force-dynamic";

/** Calendar-app format (.ics), for "Add to calendar" and subscribing. */
function toIcs(events: Awaited<ReturnType<typeof listEvents>>, host: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Theos Bookmarks//Events//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Bookmarks events"];
  for (const e of events) {
    const end = e.endDate || new Date(Date.parse(e.date) + 3600_000).toISOString();
    lines.push("BEGIN:VEVENT", `UID:${e.id}@${host}`, `DTSTAMP:${stamp(e.at || e.date)}`, `DTSTART:${stamp(e.date)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${text(e.title)}`, ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** The community calendar: anyone can see it, moderators keep it up to date. ?ics=1 (&id=) for calendar apps. */
export async function GET(req: NextRequest) {
  try {
    const events = await listEvents();
    if (req.nextUrl.searchParams.get("ics")) {
      const id = req.nextUrl.searchParams.get("id");
      const pick = id ? events.filter((e) => e.id === id) : events;
      return new NextResponse(toIcs(pick, req.nextUrl.host), {
        headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${id ? "event" : "events"}.ics"` },
      });
    }
    return NextResponse.json({ events });
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ctx = await getAuthContext();
    checkMod(ctx, typeof body.password === "string" ? body.password : undefined);
    if (ctx.role === "mod" && !(await modCan(ctx.role, "events"))) throw new Error("Admins only — moderators can't edit events here");
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
