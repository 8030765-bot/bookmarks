import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Icons are fetched once per site and then cached by Vercel's CDN and the
// browser, so this rarely runs. Serving them from our own domain also lets
// the page cache them offline and read their colours.
const CACHE = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000";
const MISS_CACHE = "public, max-age=86400, s-maxage=604800";

export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("d") || "").trim().toLowerCase();
  if (!/^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, {
      signal: AbortSignal.timeout(4000),
    });
    // Google answers 404 (with a grey globe) for sites it doesn't know: let the page draw a letter instead
    if (!res.ok) return new NextResponse(null, { status: 404, headers: { "Cache-Control": MISS_CACHE } });
    const body = await res.arrayBuffer();
    if (body.byteLength > 200_000) return new NextResponse(null, { status: 404, headers: { "Cache-Control": MISS_CACHE } });
    return new NextResponse(body, {
      headers: { "Content-Type": res.headers.get("content-type") || "image/png", "Cache-Control": CACHE, "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
