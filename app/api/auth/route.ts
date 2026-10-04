import { NextRequest, NextResponse } from "next/server";
import { extendSession, login, loginWithCode, logout, resetWithCode, sessionTimeLeft, setSessionCookie, signup } from "@/lib/auth";
import { setRulesAccepted } from "@/lib/userdata";
import { getAuthContext, getRole, ownerExists } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { notify } from "@/lib/userdata";
import { bumpStat, checkSignup, getFlags, inGroup } from "@/lib/moderation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, role, ownerExists } = await getAuthContext();
    const [contributor, beta, flags, left] = await Promise.all([inGroup("contributors", user), inGroup("beta", user), getFlags(), user ? sessionTimeLeft() : null]);
    return NextResponse.json({
      user, role, ownerExists, contributor, beta, betaFlags: flags.betaFlags || [], signups: flags.signups || "open",
      sessionLeft: left?.seconds ?? null, rememberMe: left?.remember ?? null,
    });
  } catch {
    return NextResponse.json({ user: null, role: null, ownerExists: false });
  }
}

/** Logged in: set the cookie and tell the page who you are and what you can do. */
async function loggedIn(session: { token: string; username: string; newDevice?: boolean }, remember: boolean, extra: Record<string, unknown> = {}) {
  setSessionCookie(session.token, remember);
  if (session.newDevice) {
    notify(session.username, {
      kind: "system",
      text: "Your account just logged in on a new kind of device. If that wasn't you, change your password in Account & security.",
    }).catch(() => {});
  }
  // include role + ownerExists so the client unlocks admin immediately (no refresh needed)
  const [role, hasOwner] = await Promise.all([getRole(session.username), ownerExists()]);
  return NextResponse.json({ user: session.username, role, ownerExists: hasOwner, ...extra });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const remember = body.remember !== false;
    const ip = clientIp(req);
    if (action === "extend") {
      return NextResponse.json({ sessionLeft: await extendSession() });
    }
    if (action === "logout") {
      await logout();
      return NextResponse.json({ user: null });
    }
    if (action === "reset") {
      const code = String(body.code || "");
      const newPassword = String(body.newPassword || "");
      if (!username || !code || !newPassword) return NextResponse.json({ error: "Fill in every field" }, { status: 400 });
      await rateLimit(`reset:${ip}`, 20, 15 * 60);
      const { recoveryCode } = await resetWithCode(username, code, newPassword);
      return NextResponse.json({ ok: true, recoveryCode });
    }
    if (action === "login2fa") {
      await rateLimit(`2fa:${ip}`, 30, 10 * 60);
      const session = await loginWithCode(String(body.ticket || ""), String(body.code || ""));
      return loggedIn(session, body.remember !== false);
    }
    if (action !== "signup" && action !== "login") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (!username || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }
    // per-address limits on top of the per-account lockout
    if (action === "signup") {
      await rateLimit(`signup:${ip}`, 8, 60 * 60);
      await checkSignup(username, typeof body.invite === "string" ? body.invite : "");
      const session = await signup(username, password, remember);
      await bumpStat("signups");
      // they ticked "I agree to the site rules" on the sign-up form
      if (body.acceptRules === true) await setRulesAccepted(session.username).catch(() => {});
      // signup includes the one-time recovery code so the client can show it
      return loggedIn(session, remember, { recoveryCode: session.recoveryCode });
    }
    await rateLimit(`login:${ip}`, 40, 10 * 60);
    const result = await login(username, password, remember);
    if ("needs2fa" in result) return NextResponse.json({ needs2fa: true, ticket: result.ticket, user: result.username });
    return loggedIn(result, remember);
  } catch (e: unknown) {
    return errorResponse(e);
  }
}
