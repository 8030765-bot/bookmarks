import { NextRequest, NextResponse } from "next/server";
import { deleteUser, listUsers } from "@/lib/auth";
import { clearChat, getBanned, getMessages, setBanned } from "@/lib/chat";
import { requireAdmin } from "@/lib/store";

export const dynamic = "force-dynamic";

// Admin-only actions for accounts and chat moderation.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    requireAdmin(typeof body.password === "string" ? body.password : undefined);
    const username = String(body.username || "");
    switch (String(body.action || "")) {
      case "overview": {
        const [users, messages, banned] = await Promise.all([listUsers(), getMessages(), getBanned()]);
        return NextResponse.json({ users, banned, messageCount: messages.length });
      }
      case "ban":
      case "unban":
        if (!username) throw new Error("Missing username");
        await setBanned(username, body.action === "ban");
        return NextResponse.json({ banned: await getBanned() });
      case "deleteUser":
        if (!username) throw new Error("Missing username");
        await deleteUser(username);
        await setBanned(username, false);
        return NextResponse.json({ users: await listUsers() });
      case "clearChat":
        await clearChat();
        return NextResponse.json({ messages: [] });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: message === "Wrong admin password" ? 403 : 400 });
  }
}
