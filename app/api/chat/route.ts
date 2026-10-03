import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteMessage, getMessages, postMessage, toggleReaction } from "@/lib/chat";
import { getBookmarks } from "@/lib/store";
import { audit, checkMod, getAuthContext, listRoles } from "@/lib/roles";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // roles let the page colour names (owner / admin / mod)
    const [messages, roles] = await Promise.all([getMessages(), listRoles()]);
    return NextResponse.json({ messages, roles });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in to chat" }, { status: 401 });
    const { settings } = await getBookmarks();
    if (settings?.chatEnabled === false) {
      return NextResponse.json({ error: "Chat is turned off" }, { status: 403 });
    }
    const body = await req.json();
    if (body.action === "react") {
      await toggleReaction(user, String(body.id || ""), String(body.emoji || ""));
    } else {
      await postMessage(user, String(body.text || ""), body.replyTo ? String(body.replyTo) : undefined);
    }
    return NextResponse.json({ messages: await getMessages() });
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
    return NextResponse.json({ messages: await getMessages() });
  } catch (e) {
    return errorResponse(e);
  }
}
