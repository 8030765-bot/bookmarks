import { NextRequest, NextResponse } from "next/server";
import { deleteUser, listUsers } from "@/lib/auth";
import { clearChat, getBanned, getMessages, setBanned } from "@/lib/chat";
import { getBookmarks, requireAdmin } from "@/lib/store";
import { approveSuggestion, deleteSuggestion, listSuggestions, rejectSuggestion } from "@/lib/suggestions";

export const dynamic = "force-dynamic";

// Admin-only actions for accounts, chat moderation and suggestions.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    requireAdmin(typeof body.password === "string" ? body.password : undefined);
    const username = String(body.username || "");
    switch (String(body.action || "")) {
      case "overview": {
        const [users, messages, banned, suggestions] = await Promise.all([
          listUsers(), getMessages(), getBanned(), listSuggestions(),
        ]);
        return NextResponse.json({ users, banned, messageCount: messages.length, suggestions });
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
      case "approveSuggestion":
        await approveSuggestion(String(body.id || ""), body.password, body.overrides || {});
        return NextResponse.json({ suggestions: await listSuggestions(), data: await getBookmarks() });
      case "rejectSuggestion":
        await rejectSuggestion(String(body.id || ""), body.reason);
        return NextResponse.json({ suggestions: await listSuggestions() });
      case "deleteSuggestion":
        await deleteSuggestion(String(body.id || ""));
        return NextResponse.json({ suggestions: await listSuggestions() });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Request failed";
    return NextResponse.json({ error: message }, { status: message === "Wrong admin password" ? 403 : 400 });
  }
}
