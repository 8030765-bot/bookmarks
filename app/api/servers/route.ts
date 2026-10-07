import { NextRequest, NextResponse } from "next/server";
import {
  addServerChannel, canManageServer, createServer, deleteServer, editServerChannel, getServer, isServerMember, joinServer, kickMember,
  leaveServer, listServers, newInvite, removeServerChannel, setServerMod, updateServer,
} from "@/lib/servers";
import { listChannels } from "@/lib/chat";
import { getBookmarks } from "@/lib/store";
import { AuthContext, audit, getAuthContext } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { assertWritable, filterWords, restriction } from "@/lib/moderation";
import { ChatServer } from "@/lib/types";

export const dynamic = "force-dynamic";

const isStaff = (ctx: AuthContext) => ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";

/** What someone outside a server may see of it. */
const summary = (s: ChatServer) => ({
  id: s.id, name: s.name, icon: s.icon, color: s.color, description: s.description, public: s.public, memberCount: s.members.length, owner: s.owner,
});

async function state(ctx: AuthContext) {
  const [all, { settings }] = await Promise.all([listServers(), getBookmarks()]);
  const me = ctx.user?.toLowerCase();
  const staff = isStaff(ctx);
  return {
    enabled: settings?.chatServers !== false,
    staff,
    // the servers you're in (everything about them)
    servers: me ? all.filter((s) => s.members.includes(me)) : [],
    // public servers to discover
    explore: all.filter((s) => s.public && !(me && s.members.includes(me))).map(summary),
    // staff see every server, invite-only ones too
    ...(staff ? { all: all.filter((s) => !(me && s.members.includes(me))).map((s) => ({ ...summary(s), invite: s.invite })) } : {}),
  };
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    return NextResponse.json(await state(ctx));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.user;
    if (!user) return NextResponse.json({ error: "Log in to use servers" }, { status: 401 });
    await assertWritable(ctx.role);
    const body = await req.json();
    const action = String(body.action || "");
    const staff = isStaff(ctx);
    const { settings } = await getBookmarks();
    const off = settings?.chatServers === false && !staff;
    const clean = async (o: Record<string, unknown>) => {
      const out = { ...o };
      for (const k of ["name", "description", "topic"]) if (typeof out[k] === "string") out[k] = await filterWords(out[k] as string);
      return out;
    };
    const done = async (extra: Record<string, unknown> = {}) => NextResponse.json({ ...(await state(ctx)), ...extra });

    if (action === "create") {
      if (off) throw new Error("Making servers is turned off by the admins");
      const why = await restriction(user);
      if (why) throw new Error(why);
      await rateLimit(`servers:create:${user.toLowerCase()}`, 3, 60 * 60);
      const s = await createServer(user, await clean(body.server || {}));
      await audit(ctx, "createServer", `${s.name} (${s.public ? "public" : "invite only"})`).catch(() => {});
      return done({ created: s.id });
    }
    if (action === "join") {
      if (off) throw new Error("Servers are turned off by the admins");
      await rateLimit(`servers:join:${user.toLowerCase()}`, 20, 60 * 10);
      const s = await joinServer(user, String(body.code || body.id || ""), staff);
      return done({ joined: s.id });
    }

    const server = await getServer(String(body.id || ""));
    if (!server) throw new Error("That server doesn't exist any more");
    const manage = canManageServer(server, user, staff);
    const member = isServerMember(server, user);
    const needManage = () => { if (!manage) throw new Error("Only the server's owner and moderators can do that"); };
    const ownerOnly = () => { if (server.owner !== user.toLowerCase() && !staff) throw new Error("Only the server's owner can do that"); };
    const asStaff = (what: string) => (staff && !member ? audit(ctx, what, `${server.name} (${server.id})`).catch(() => {}) : Promise.resolve());

    switch (action) {
      case "leave":
        await leaveServer(user, server);
        return done();
      case "update":
        needManage();
        await updateServer(server, await clean(body.server || {}));
        await asStaff("editServer");
        return done();
      case "invite":
        if (!member && !staff) throw new Error("Join the server first");
        return done({ invite: (await newInvite(server)).invite });
      case "kick":
      case "ban":
      case "unban": {
        needManage();
        const target = String(body.user || "").toLowerCase();
        if ((server.mods || []).includes(target) && server.owner !== user.toLowerCase() && !staff) throw new Error("Only the owner can remove a moderator");
        await kickMember(server, target, action === "ban");
        await asStaff(`${action}ServerMember`);
        return done();
      }
      case "mod":
        ownerOnly();
        await setServerMod(server, String(body.user || ""), body.on !== false);
        return done();
      case "addChannel":
        needManage();
        await rateLimit(`servers:chan:${user.toLowerCase()}`, 20, 60 * 10);
        await addServerChannel(server, await clean(body.channel || {}));
        return done({ channels: (await listChannels()).filter((c) => c.serverId === server.id) });
      case "editChannel":
        needManage();
        await editServerChannel(server, String(body.ch || ""), await clean(body.channel || {}));
        return done();
      case "removeChannel":
        needManage();
        await removeServerChannel(server, String(body.ch || ""));
        await asStaff("removeServerChannel");
        return done();
      case "delete":
        ownerOnly();
        await deleteServer(server);
        await audit(ctx, "deleteServer", `${server.name} (${server.id})`).catch(() => {});
        return done();
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
