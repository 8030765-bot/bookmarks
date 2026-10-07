import { Redis } from "@upstash/redis";
import {
  BuiltDesign, DesignPiece, FONT_CHOICES, PART_BY_ID, cleanCanvas, cleanPieces, defaultProps, newPieceId, partsForAI,
} from "./pieces";

/**
 * The design builder's AI helper. It can build a whole page, change the
 * pieces you picked, or just chat about ideas. It uses Pollinations' free
 * AI (no account needed); each person gets AI_DAILY messages a day so the
 * site doesn't hit Pollinations' limits. The owner isn't limited.
 */
export const AI_DAILY = 15;
const redis = () => Redis.fromEnv();
const today = () => new Date().toISOString().slice(0, 10);
const usageKey = (user: string) => `ai:design:${user.toLowerCase()}:${today()}`;

export async function aiUsage(user: string, unlimited: boolean) {
  const used = Number((await redis().get<number>(usageKey(user))) || 0);
  return { limit: AI_DAILY, used, left: unlimited ? null : Math.max(0, AI_DAILY - used), unlimited };
}

/** Use up one message (or say no). Returns a way to give it back if the AI fails. */
export async function takeMessage(user: string, unlimited: boolean): Promise<() => Promise<void>> {
  const key = usageKey(user);
  const n = await redis().incr(key);
  if (n === 1) await redis().expire(key, 60 * 60 * 26);
  if (!unlimited && n > AI_DAILY) {
    await redis().incrby(key, -1);
    throw new Error(`You've used your ${AI_DAILY} AI messages for today — they come back tomorrow`);
  }
  return async () => { await redis().incrby(key, -1).catch(() => {}); };
}

/* ---------- asking the AI ---------- */
type Msg = { role: "system" | "user" | "assistant"; content: string };
function endpoints(): { url: string; key?: string; model: string }[] {
  if (process.env.DESIGN_AI_URL) return [{ url: process.env.DESIGN_AI_URL, model: "openai" }];
  const list: { url: string; key?: string; model: string }[] = [];
  // a free Pollinations key (enter.pollinations.ai) makes it reliable; other free keys work too
  if (process.env.POLLINATIONS_KEY) list.push({ url: "https://gen.pollinations.ai/v1/chat/completions", key: process.env.POLLINATIONS_KEY, model: "openai" });
  if (process.env.GROQ_API_KEY) list.push({ url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: "llama-3.3-70b-versatile" });
  if (process.env.GEMINI_API_KEY) list.push({ url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: process.env.GEMINI_API_KEY, model: "gemini-2.5-flash" });
  // no key at all: Pollinations' free, no-account addresses (often busy)
  list.push({ url: "https://gen.pollinations.ai/v1/chat/completions", model: "openai" }, { url: "https://text.pollinations.ai/openai", model: "openai" });
  return list;
}
async function complete(messages: Msg[]): Promise<string> {
  let lastError = "The AI didn't answer";
  const started = Date.now();
  // two rounds through every address: they're sometimes busy for a moment (but stop before the page gives up)
  for (let round = 0; round < 2; round++) {
    for (const ep of endpoints()) {
      if (Date.now() - started > 40_000) break;
      try {
        const r = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(ep.key ? { Authorization: `Bearer ${ep.key}` } : {}) },
          body: JSON.stringify({ model: ep.model, messages, ...(ep.url.includes("pollinations") ? { referrer: "theos-bookmarks", private: true } : {}) }),
          signal: AbortSignal.timeout(25_000),
        });
        const text = await r.text();
        if (!r.ok) { lastError = `AI error ${r.status}`; continue; }
        const j = JSON.parse(text);
        const content = j?.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) return content;
        lastError = "The AI sent an empty answer";
      } catch (e) {
        lastError = e instanceof Error && e.name === "TimeoutError" ? "The AI took too long" : "Couldn't reach the AI";
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`The free AI isn't answering right now (${lastError}) — try again in a little while`);
}

/** The bit of the reply that's JSON (models like to wrap it in ``` fences). */
function parseReply(raw: string): Record<string, unknown> {
  const s = raw.replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch {}
  }
  return { reply: raw.trim().slice(0, 600), action: "none" };
}

const system = () => `You are the AI helper inside a Figma-style page builder for a school bookmarks website (students save useful websites in folders).
The page is a grid 24 columns wide; each row is 16px tall. A laptop screen shows about 50 rows. Place pieces with x and w in columns (0-24) and y and h in rows.

Parts you can use (id (name) default size {options}):
${partsForAI()}

Auto layout: a "stack" piece lines up pieces you put inside it. Give the child "parent": "<stack id>". Children may set "sizeW"/"sizeH" to "fixed", "fill" or "hug". Stack options: dir row|column, gap, pad, align, justify.
Piece "style" (all optional): bg, text, accent, borderColor (hex colours); glass (true/false); radius (0-999); borderWidth (0-12); shadow (none|soft|strong|glow); pad (0-80); opacity (0.05-1); font (${FONT_CHOICES.map((f) => f.id).join("|")}); size (text size %, 50-250); keep (true keeps a design piece's own colours).
Page ("canvas"): bg, text, accent (hex), font, tone (dark|light), bgPattern (none|dots|grid|gradient|aurora|stripes), bgImage (https url or ""), blend (true makes every piece match the page colours).

Answer with ONE JSON object and nothing else:
{"reply": "1-2 short friendly sentences", "action": "none" | "replace" | "edit", "canvas": {page changes, optional}, "pieces": [...], "remove": ["ids to delete"]}
- "replace": build a whole new page. "pieces" is the complete list: {"id","part","x","y","w","h","z","parent","sizeW","sizeH","props":{},"style":{}}.
- "edit": "pieces" lists only what to add or change (an existing id changes that piece; a new id adds one). "remove" deletes.
- "none": just chatting or giving ideas; nothing changes.
Rules: only use the parts above. Keep everything inside the 24 columns. Don't overlap pieces except decorations (blob, pattern, bgimage, box, glass, gradient) placed behind with a lower z. A whole page needs a way to find websites (folders, apps, board-columns, desk-boxes or zen-lists) and a search (search or topbar). Use colours that are easy to read. If pieces are selected, change those unless asked otherwise. Keep it school-appropriate.`;

/** The design, written short for the AI. */
function describe(d: Pick<BuiltDesign, "canvas" | "pieces">) {
  const lines = d.pieces.slice(0, 120).map((p) => {
    const part = PART_BY_ID.get(p.part);
    const defs = part ? defaultProps(part) : {};
    const props = Object.fromEntries(Object.entries(p.props || {}).filter(([k, v]) => defs[k] !== v));
    return JSON.stringify({ id: p.id, part: p.part, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z, ...(p.parent ? { parent: p.parent } : {}), ...(p.sizeW ? { sizeW: p.sizeW } : {}), ...(p.sizeH ? { sizeH: p.sizeH } : {}), ...(Object.keys(props).length ? { props } : {}), ...(p.style ? { style: p.style } : {}) });
  });
  return `Page: ${JSON.stringify(d.canvas)}\nPieces (${d.pieces.length}):\n${lines.join("\n") || "(none yet)"}`;
}

export interface AiResult { reply: string; action: "none" | "replace" | "edit"; design?: Pick<BuiltDesign, "canvas" | "pieces"> }

export async function askDesignAI(input: {
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
  design: Pick<BuiltDesign, "canvas" | "pieces">;
  selection: string[];
}): Promise<AiResult> {
  const messages: Msg[] = [{ role: "system", content: system() }];
  for (const h of input.history.slice(-6)) messages.push({ role: h.role, content: h.text.slice(0, 600) });
  messages.push({
    role: "user",
    content: `${describe(input.design)}\nSelected: ${input.selection.length ? input.selection.join(", ") : "nothing"}\n\nRequest: ${input.message}`,
  });
  const out = parseReply(await complete(messages));
  const reply = typeof out.reply === "string" && out.reply.trim() ? out.reply.trim().slice(0, 600) : "Done!";
  const action = out.action === "replace" || out.action === "edit" ? out.action : "none";
  if (action === "none" && !out.canvas) return { reply, action: "none" };

  const canvas = cleanCanvas({ ...input.design.canvas, ...(out.canvas && typeof out.canvas === "object" ? out.canvas : {}) });
  const given = (Array.isArray(out.pieces) ? out.pieces : []).filter((p): p is Record<string, unknown> => !!p && typeof p === "object");
  let pieces: Record<string, unknown>[];
  const ids = new Map<string, string>();
  const fresh = (raw: unknown, taken: Set<string>) => {
    const id = typeof raw === "string" && /^[a-z0-9]{3,24}$/i.test(raw) && !taken.has(raw) ? raw : newPieceId();
    taken.add(id);
    return id;
  };
  if (action === "replace") {
    const taken = new Set<string>();
    for (const p of given) ids.set(String(p.id ?? Math.random()), fresh(p.id, taken));
    pieces = given.map((p, i) => ({ ...p, id: ids.get(String(p.id)), z: typeof p.z === "number" ? p.z : i + 1 }));
  } else {
    const current = new Map(input.design.pieces.map((p) => [p.id, p as unknown as Record<string, unknown>]));
    const remove = new Set(Array.isArray(out.remove) ? out.remove.map(String) : []);
    const taken = new Set(current.keys());
    let z = Math.max(0, ...input.design.pieces.map((p) => p.z));
    for (const p of given) {
      const old = typeof p.id === "string" ? current.get(p.id) : undefined;
      if (old) {
        current.set(p.id as string, {
          ...old, ...p, part: old.part,
          props: { ...(old.props as object || {}), ...(p.props && typeof p.props === "object" ? p.props : {}) },
          style: { ...(old.style as object || {}), ...(p.style && typeof p.style === "object" ? p.style : {}) },
        });
      } else if (PART_BY_ID.has(String(p.part))) {
        const id = fresh(p.id, taken);
        if (typeof p.id === "string") ids.set(p.id, id);
        current.set(id, { ...p, id, z: typeof p.z === "number" ? p.z : ++z });
      }
    }
    for (const id of Array.from(remove)) current.delete(id);
    pieces = Array.from(current.values());
  }
  // new pieces may point at frames by the AI's own names for them
  for (const p of pieces) if (typeof p.parent === "string" && ids.has(p.parent)) p.parent = ids.get(p.parent);
  const cleaned: DesignPiece[] = cleanPieces(pieces);
  return { reply, action, design: { canvas, pieces: cleaned } };
}
