import { NextRequest, NextResponse } from "next/server";
import { AI_DAILY, aiUsage, askDesignAI, takeMessage } from "@/lib/designai";
import { PART_BY_ID, cleanCanvas, cleanPieces } from "@/lib/pieces";
import { getAuthContext } from "@/lib/roles";
import { errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { assertWritable, filterWords, restriction } from "@/lib/moderation";

export const dynamic = "force-dynamic";
// the free AI can take a while to think
export const maxDuration = 60;

/** How many AI messages you have left today. */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx.user) return NextResponse.json({ error: "Log in to use the AI" }, { status: 401 });
    return NextResponse.json(await aiUsage(ctx.user, ctx.role === "owner"));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Ask the AI to build, change or talk about a design. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const user = ctx.user;
    if (!user) return NextResponse.json({ error: "Log in to use the AI" }, { status: 401 });
    await assertWritable(ctx.role);
    const why = await restriction(user);
    if (why) throw new Error(why);
    const owner = ctx.role === "owner";
    const body = await req.json();
    const message = String(body.message || "").trim().slice(0, 800);
    if (!message) throw new Error("Type what you'd like the AI to do");
    // a stuck button (or the owner, who has no daily cap) can't flood the free AI
    await rateLimit(`designai:${user.toLowerCase()}`, 20, 60);
    const refund = await takeMessage(user, owner);
    try {
      const design = { canvas: cleanCanvas(body.design?.canvas), pieces: cleanPieces(body.design?.pieces) };
      const selection = Array.isArray(body.selection) ? body.selection.map(String).filter((id: string) => design.pieces.some((p) => p.id === id)) : [];
      const history = (Array.isArray(body.history) ? body.history : [])
        .filter((h: { role?: string; text?: unknown }) => (h?.role === "user" || h?.role === "assistant") && typeof h.text === "string")
        .slice(-6) as { role: "user" | "assistant"; text: string }[];
      const result = await askDesignAI({ message, history, design, selection });
      // the word filter covers what the AI writes too
      result.reply = await filterWords(result.reply);
      if (result.design) {
        for (const p of result.design.pieces) {
          const part = PART_BY_ID.get(p.part);
          for (const def of part?.props || []) {
            if ((def.type === "text" || def.type === "longtext") && typeof p.props?.[def.key] === "string") p.props[def.key] = await filterWords(p.props[def.key] as string);
          }
        }
      }
      return NextResponse.json({ ...result, usage: await aiUsage(user, owner) });
    } catch (e) {
      await refund();
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes(`${AI_DAILY} AI messages`)) return NextResponse.json({ error: msg }, { status: 429 });
    return errorResponse(e);
  }
}
