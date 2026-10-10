import { NextRequest, NextResponse } from "next/server";
import { clubChannelId, createClub, deleteClub, editClub, joinClub, leaveClub, listClubs, setMember } from "@/lib/clubs";
import { audit, getAuthContext } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { listUsers } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Every club (anyone can see clubs exist; only members see the club channel). */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    const me = ctx.user?.toLowerCase();
    const clubs = (await listClubs()).map((c) => ({
      ...c,
      channel: clubChannelId(c),
      memberCount: c.members.length,
      isMember: !!me && c.members.includes(me),
      isOwner: !!me && c.owner === me,
    }));
    return NextResponse.json({ clubs });
  } catch (e) {
    return errorResponse(e, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx.user) return NextResponse.json({ error: "Log in to use clubs" }, { status: 401 });
    const user = ctx.user;
    const staff = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";
    const body = await req.json();
    const id = String(body.id || "");
    await rateLimit(`clubs:${user.toLowerCase()}`, 30, 60);
    switch (String(body.action || "")) {
      case "create": {
        const club = await createClub(user, body);
        await audit(ctx, "createClub", club.name).catch(() => {});
        return NextResponse.json({ club });
      }
      case "join":
        return NextResponse.json({ club: await joinClub(user, id) });
      case "leave":
        return NextResponse.json({ club: await leaveClub(user, id) });
      case "add":
      case "remove": {
        const target = String(body.username || "");
        if (!(await listUsers()).some((u) => u.username.toLowerCase() === target.toLowerCase())) throw new Error("No such account");
        return NextResponse.json({ club: await setMember(user, staff, id, target, body.action === "add") });
      }
      case "edit":
        return NextResponse.json({ club: await editClub(user, staff, id, body.patch || {}) });
      case "delete":
        await deleteClub(user, staff, id);
        await audit(ctx, "deleteClub", id).catch(() => {});
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
