import { NextRequest, NextResponse } from "next/server";

/**
 * Runs before every page and API call.
 * 1. Optional password on preview deployments (set PREVIEW_PASSWORD for the
 *    Preview environment in Vercel). Previews share the live database, so
 *    this keeps random people off half-finished builds.
 * 2. API writes must come from this site as JSON — blocks other websites
 *    from submitting forms at the API with a visitor's login cookie.
 */
export function middleware(req: NextRequest) {
  const previewPassword = process.env.PREVIEW_PASSWORD;
  if (process.env.VERCEL_ENV === "preview" && previewPassword) {
    const header = req.headers.get("authorization") || "";
    let given = "";
    try {
      given = header.startsWith("Basic ") ? atob(header.slice(6)).split(":").slice(1).join(":") : "";
    } catch {
      given = "";
    }
    if (given !== previewPassword) {
      return new NextResponse("This preview is password protected.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Preview", charset="UTF-8"' },
      });
    }
  }

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
      }
    }
    if (!(req.headers.get("content-type") || "").includes("application/json")) {
      return NextResponse.json({ error: "Send JSON" }, { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|sw.js|icon.svg|favicon.ico).*)"],
};
