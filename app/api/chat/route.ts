import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteMessage, getMessages, postMessage, toggleReaction } from "@/lib/chat";
import { getBookmarks, requireAdmin } from "@/lib/store";

export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  const status =
    (message === "Wrong admin password" || message.startsWith("Admin is disabled")) || message.includes("muted") ? 403 : message.startsWith("Slow down") ? 429 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    return NextResponse.json({ messages: await getMessages() });
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
    requireAdmin(typeof body.password === "string" ? body.password : undefined);
    await deleteMessage(String(body.id || ""));
    return NextResponse.json({ messages: await getMessages() });
  } catch (e) {
    return errorResponse(e);
  }
}
