import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, login, logout, setSessionCookie, signup } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() });
  } catch {
    return NextResponse.json({ user: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (action === "logout") {
      await logout();
      return NextResponse.json({ user: null });
    }
    if (action !== "signup" && action !== "login") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }
    const session = action === "signup" ? await signup(username, password) : await login(username, password);
    setSessionCookie(session.token);
    return NextResponse.json({ user: session.username });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Request failed";
    const status = message.startsWith("Wrong") ? 401 : message.startsWith("Too many") ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

