import { NextRequest, NextResponse } from "next/server";
import { copyDesign, countUse, deleteDesign, getDesign, listDesigns, saveDesign, setGallery } from "@/lib/designs";
import { BuiltDesign, PART_BY_ID } from "@/lib/pieces";
import { getBookmarks } from "@/lib/store";
import { AuthContext, audit, getAuthContext } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { assertWritable, filterWords, restriction } from "@/lib/moderation";

export const dynamic = "force-dynamic";

const isStaff = (ctx: AuthContext) => ctx.role === "owner" || ctx.role === "admin" || ctx.role === "mod";

/** What the gallery shows of a design. */
const card = (d: BuiltDesign) => ({
  id: d.id, name: d.name, emoji: d.emoji, owner: d.owner, description: d.description, updatedAt: d.updatedAt, uses: d.uses || 0, gallery: d.gallery,
  canvas: d.canvas, pieces: d.pieces,
});

/** Can this person see this design? Yours, shared ones, the site default, or anything for staff. */
async function canSee(ctx: AuthContext, d: BuiltDesign) {
  if (isStaff(ctx) || d.gallery === "approved") return true;
  if (ctx.user && d.owner === ctx.user.toLowerCase()) return true;
  const { settings } = await getBookmarks();
  return settings?.defaultDesign === d.id;
}

async function state(ctx: AuthContext) {
  const [all, { settings }] = await Promise.all([listDesigns(), getBookmarks()]);
  const me = ctx.user?.toLowerCase();
  const staff = isStaff(ctx);
  return {
    staff,
    siteDefault: settings?.defaultDesign || "",
    mine: me ? all.filter((d) => d.owner === me) : [],
    gallery: all.filter((d) => d.gallery === "approved").sort((a, b) => (b.uses || 0) - (a.uses || 0)).map(card),
    ...(staff ? { pending: all.filter((d) => d.gallery === "pending").map(card) } : {}),
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const d = await getDesign(id);
      if (!d || !(await canSee(ctx, d))) return NextResponse.json({ error: "That design isn't available" }, { status: 404 });
      return NextResponse.json({ design: d });
    }
    return NextResponse.json(await state(ctx));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.user;
    if (!user) return NextResponse.json({ error: "Log in to save designs" }, { status: 401 });
    await assertWritable(ctx.role);
    const body = await req.json();
    const action = String(body.action || "");
    const staff = isStaff(ctx);
    const done = async (extra: Record<string, unknown> = {}) => NextResponse.json({ ...(await state(ctx)), ...extra });

    if (action === "save") {
      await rateLimit(`designs:save:${user.toLowerCase()}`, 120, 60 * 10);
      const input = (body.design || {}) as Record<string, unknown>;
      const existing = input.id ? await getDesign(String(input.id)) : null;
      if (input.id && !existing) throw new Error("That design doesn't exist any more");
      if (existing && existing.owner !== user.toLowerCase()) throw new Error("You can only change your own designs — make a copy instead");
      // the word filter covers everything people typed
      if (typeof input.name === "string") input.name = await filterWords(input.name);
      if (typeof input.description === "string") input.description = await filterWords(input.description);
      if (Array.isArray(input.pieces)) {
        for (const p of input.pieces as Record<string, unknown>[]) {
          if (!p || typeof p !== "object") continue;
          if (typeof p.name === "string") p.name = await filterWords(p.name);
          const part = PART_BY_ID.get(String(p.part));
          const props = p.props as Record<string, unknown> | undefined;
          if (!part || !props) continue;
          for (const def of part.props || []) if ((def.type === "text" || def.type === "longtext") && typeof props[def.key] === "string") props[def.key] = await filterWords(props[def.key] as string);
        }
      }
      const d = await saveDesign(user, input, existing);
      return done({ saved: d });
    }

    if (action === "copy") {
      const src = await getDesign(String(body.id || ""));
      if (!src || !(await canSee(ctx, src))) throw new Error("That design isn't available");
      const d = await copyDesign(user, src);
      return done({ saved: d });
    }

    const d = await getDesign(String(body.id || ""));
    if (!d) throw new Error("That design doesn't exist any more");
    const mine = d.owner === user.toLowerCase();

    switch (action) {
      case "use":
        if (!(await canSee(ctx, d))) throw new Error("That design isn't available");
        if (!mine) await rateLimit(`designs:use:${user.toLowerCase()}:${d.id}`, 1, 60 * 60 * 24).then(() => countUse(d)).catch(() => {});
        return done();
      case "share": {
        if (!mine) throw new Error("Only the designer can share this");
        const why = await restriction(user);
        if (why) throw new Error(why);
        await setGallery(d, staff ? "approved" : "pending");
        return done();
      }
      case "unshare":
        if (!mine && !staff) throw new Error("Only the designer can do that");
        await setGallery(d, undefined);
        if (!mine) await audit(ctx, "removeDesignFromGallery", `${d.name} by ${d.owner}`).catch(() => {});
        return done();
      case "approve":
      case "reject":
        if (!staff) throw new Error("Only moderators can check designs");
        await setGallery(d, action === "approve" ? "approved" : undefined);
        await audit(ctx, action === "approve" ? "approveDesign" : "rejectDesign", `${d.name} by ${d.owner}`).catch(() => {});
        return done();
      case "delete":
        if (!mine && !staff) throw new Error("You can only delete your own designs");
        await deleteDesign(d.id);
        if (!mine) await audit(ctx, "deleteDesign", `${d.name} by ${d.owner}`).catch(() => {});
        return done();
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
