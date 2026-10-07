import { NextRequest, NextResponse } from "next/server";
import { getImage } from "@/lib/images";
import { getAuthContext } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * An uploaded picture. Approved ones can be cached forever (a new picture
 * always gets a new id); one still waiting for a moderator is only shown to
 * whoever uploaded it and to staff.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const img = await getImage(String(params.id || "")).catch(() => null);
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!img) return notFound();
  if (img.status !== "ok") {
    const ctx = await getAuthContext();
    const staff = ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";
    if (!staff && ctx.user?.toLowerCase() !== img.owner.toLowerCase()) return notFound();
  }
  return new NextResponse(Buffer.from(img.data, "base64"), {
    headers: {
      "Content-Type": img.type,
      "Cache-Control": img.status === "ok" ? "public, max-age=31536000, immutable" : "private, no-store",
      // a picture, never a page
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
