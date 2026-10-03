import { NextRequest, NextResponse } from "next/server";
import { login, logout, resetWithCode, setSessionCookie, signup } from "@/lib/auth";
import { getAuthContext, getRole, ownerExists } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, role, ownerExists } = await getAuthContext();
    return NextResponse.json({ user, role, ownerExists });
  } catch {
    return NextResponse.json({ user: null, role: null, ownerExists: false });
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
    if (action === "reset") {
      const code = String(body.code || "");
      const newPassword = String(body.newPassword || "");
      if (!username || !code || !newPassword) return NextResponse.json({ error: "Fill in every field" }, { status: 400 });
      const { recoveryCode } = await resetWithCode(username, code, newPassword);
      return NextResponse.json({ ok: true, recoveryCode });
    }
    if (action !== "signup" && action !== "login") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }
    const session = action === "signup" ? await signup(username, password) : await login(username, password);
    setSessionCookie(session.token);
    // include role + ownerExists so the client unlocks admin immediately (no refresh needed)
    const [role, hasOwner] = await Promise.all([getRole(session.username), ownerExists()]);
    // signup includes the one-time recovery code so the client can show it
    const recoveryCode = action === "signup" ? (session as { recoveryCode?: string }).recoveryCode : undefined;
    return NextResponse.json({ user: session.username, role, ownerExists: hasOwner, recoveryCode });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Request failed";
    const status = message.startsWith("Wrong") ? 401 : message.startsWith("Too many") ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

