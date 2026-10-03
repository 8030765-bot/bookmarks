import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteMessage, getMessages, postMessage } from "@/lib/chat";
import { requireAdmin } from "@/lib/store";

export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  const status =
    message === "Wrong admin password" ? 403 : message.startsWith("Slow down") ? 429 : 400;
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
    const body = await req.json();
    await postMessage(user, String(body.text || ""));
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
