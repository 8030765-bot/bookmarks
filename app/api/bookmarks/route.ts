import { NextRequest, NextResponse } from "next/server";
import { getBookmarks, handleAction } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

// actions that need to know who is asking
const USER_ACTIONS = new Set(["addLink", "toggleLike", "votePoll"]);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const data = await getBookmarks();
    // live-sync polling: skip the full payload when nothing changed
    const since = req.nextUrl.searchParams.get("rev");
    if (since !== null && Number(since) === (data.rev || 0)) {
      return NextResponse.json({ unchanged: true, rev: data.rev || 0 });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }
    // never trust a client-supplied identity
    delete body.__user;
    if (USER_ACTIONS.has(action)) body.__user = (await getCurrentUser()) || undefined;
    // handleAction ALWAYS returns full BookmarksData with folders array
    const data = await handleAction(action, body);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Request failed";
    const status =
      (message === "Wrong admin password" || message.startsWith("Admin is disabled"))
        ? 403
        : message.startsWith("Log in")
          ? 401
          : message.includes("closed") || message.startsWith("A poll") || message.startsWith("No web links")
            ? 400
        : message === "Unknown action" || message.startsWith("Missing") || message.includes("not found") || message.includes("Invalid")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
