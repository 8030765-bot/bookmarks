import { NextRequest, NextResponse } from "next/server";
import {
  cleanChannelId, deleteMessage, editMessage, getKeywords, getMessages, getPins, getTyping, listChannels, messageOwner,
  postMessage, removeChannel, saveChannel, searchMessages, setAnswered, setKeywords, setPinned, setTyping, toggleReaction, votePoll,
  getAllMessages,
} from "@/lib/chat";
import { getBookmarks } from "@/lib/store";
import { AuthContext, audit, checkAdmin, checkMod, getAuthContext, listRoles } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { getClub, isMember } from "@/lib/clubs";
import { rateLimit } from "@/lib/ratelimit";
import { ChatChannel } from "@/lib/types";

export const dynamic = "force-dynamic";

const isStaff = (ctx: AuthContext) => ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";

/** Club channels are for the club's members (and moderators); everything else is public. */
async function visibleChannels(ctx: AuthContext): Promise<ChatChannel[]> {
  const all = await listChannels();
  const out: ChatChannel[] = [];
  for (const c of all) {
    if (!c.clubId || isStaff(ctx) || (ctx.user && isMember(await getClub(c.clubId), ctx.user))) out.push(c);
  }
  return out;
}
async function requireChannel(ctx: AuthContext, ch: string) {
  const c = (await visibleChannels(ctx)).find((x) => x.id === ch);
  if (!c) throw new Error("That channel doesn't exist or is for club members");
  return c;
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const ctx = await getAuthContext();
    const ch = cleanChannelId(params.get("ch"));
    if (params.get("typing")) {
      await requireChannel(ctx, ch);
      return NextResponse.json({ typing: (await getTyping(ch)).filter((u) => u.toLowerCase() !== ctx.user?.toLowerCase()) });
    }
    const channels = await visibleChannels(ctx);
    if (params.get("mine")) {
      // "download my messages"
      if (!ctx.user) return NextResponse.json({ error: "Log in first" }, { status: 401 });
      const ids = new Set(channels.map((c) => c.id));
      const mine = (await getAllMessages()).filter((m) => m.user.toLowerCase() === ctx.user!.toLowerCase() && ids.has(m.channel || "general"));
      return new NextResponse(JSON.stringify(mine, null, 2), {
        headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="my-chat-messages.json"` },
      });
    }
    const q = params.get("q");
    if (q) return NextResponse.json({ results: await searchMessages(q, channels.map((c) => c.id)) });
    if (!channels.some((c) => c.id === ch)) throw new Error("That channel doesn't exist or is for club members");
    const [{ messages, hasMore }, roles, pins, keywords, { settings }] = await Promise.all([
      getMessages(ch, { before: params.get("before") || undefined }),
      listRoles(),
      getPins(ch),
      ctx.user ? getKeywords(ctx.user) : Promise.resolve([]),
      getBookmarks(),
    ]);
    return NextResponse.json({
      channel: ch, messages, hasMore, roles, pins, keywords, channels,
      shortcodes: settings?.chatShortcodes || {},
      maxLen: settings?.chatMaxLen || 500,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.user;
    if (!user) return NextResponse.json({ error: "Log in to chat" }, { status: 401 });
    const body = await req.json();
    const action = String(body.action || "send");
    const ch = cleanChannelId(body.ch);
    const { settings } = await getBookmarks();
    if (settings?.chatEnabled === false && !isStaff(ctx)) {
      return NextResponse.json({ error: "Chat is turned off" }, { status: 403 });
    }
    const reply = async (extra: Record<string, unknown> = {}) => {
      const { messages, hasMore } = await getMessages(ch);
      return NextResponse.json({ channel: ch, messages, hasMore, pins: await getPins(ch), ...extra });
    };
    const id = String(body.id || "");
    switch (action) {
      case "send":
        await requireChannel(ctx, ch);
        await rateLimit(`chat:${user.toLowerCase()}`, 30, 60);
        await postMessage(user, String(body.text || ""), {
          channel: ch,
          replyTo: body.replyTo ? String(body.replyTo) : undefined,
          announce: ctx.role === "owner" || ctx.role === "admin",
          maxLen: settings?.chatMaxLen,
          linkAllow: settings?.chatLinkAllow,
        });
        return reply();
      case "react":
        await requireChannel(ctx, ch);
        await toggleReaction(user, ch, id, String(body.emoji || ""));
        return reply();
      case "edit":
        await editMessage(user, ch, id, String(body.text || ""));
        return reply();
      case "delete": {
        // your own message, or anyone's if you moderate
        const owner = await messageOwner(ch, id);
        if (!owner) throw new Error("Message not found");
        if (owner.toLowerCase() !== user.toLowerCase()) {
          checkMod(ctx, typeof body.password === "string" ? body.password : undefined);
          await audit(ctx, "deleteMessage", `${owner}: ${id}`).catch(() => {});
        }
        await deleteMessage(id);
        return reply();
      }
      case "answer":
        await setAnswered(user, ch, id, body.answered !== false, isStaff(ctx));
        return reply();
      case "vote":
        await requireChannel(ctx, ch);
        await votePoll(user, ch, id, Number(body.option));
        return reply();
      case "pin":
        checkMod(ctx);
        await setPinned(ch, id, body.pinned !== false);
        await audit(ctx, body.pinned !== false ? "pinMessage" : "unpinMessage", id).catch(() => {});
        return reply();
      case "typing":
        await setTyping(user, ch);
        return NextResponse.json({ ok: true });
      case "keywords":
        return NextResponse.json({ keywords: await setKeywords(user, body.words) });
      case "saveChannel": {
        // admins: topic, rules, slow mode — or a brand-new public channel
        checkAdmin(ctx);
        const c = (body.channel || {}) as Record<string, unknown>;
        const existing = (await listChannels()).find((x) => x.id === cleanChannelId(c.id));
        const name = String(c.name || existing?.name || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
        if (!name) throw new Error("Give the channel a name");
        const next: ChatChannel = {
          ...(existing || { id: name, createdAt: new Date().toISOString() }),
          name,
          emoji: String(c.emoji || existing?.emoji || "💬").slice(0, 8),
          topic: typeof c.topic === "string" ? c.topic.trim().slice(0, 120) || undefined : existing?.topic,
          rules: typeof c.rules === "string" ? c.rules.trim().slice(0, 600) || undefined : existing?.rules,
          slow: typeof c.slow === "number" ? Math.min(300, Math.max(0, Math.round(c.slow))) || undefined : existing?.slow,
        };
        if (!existing && (await listChannels()).length >= 20) throw new Error("That's plenty of channels already");
        await saveChannel(next);
        await audit(ctx, "saveChannel", `#${next.name}`).catch(() => {});
        return NextResponse.json({ channels: await visibleChannels(ctx) });
      }
      case "removeChannel":
        checkAdmin(ctx);
        await removeChannel(ch);
        await audit(ctx, "removeChannel", `#${ch}`).catch(() => {});
        return NextResponse.json({ channels: await visibleChannels(ctx) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const ctx = await getAuthContext();
    checkMod(ctx, typeof body.password === "string" ? body.password : undefined);
    await deleteMessage(String(body.id || ""));
    await audit(ctx, "deleteMessage", String(body.id || "")).catch(() => {});
    const ch = cleanChannelId(body.ch);
    return NextResponse.json({ channel: ch, ...(await getMessages(ch)) });
  } catch (e) {
    return errorResponse(e);
  }
}
