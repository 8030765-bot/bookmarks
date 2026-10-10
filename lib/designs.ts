import { Redis } from "@upstash/redis";
import { BuiltDesign, cleanCanvas, cleanPieces } from "./pieces";

/**
 * Designs people build in the design builder. Each belongs to whoever
 * made it; they can share it to the gallery, where it waits for a
 * moderator to check it before anyone else sees it.
 */
const KEY = "designs"; // hash: design id -> BuiltDesign
export const MAX_DESIGNS = 12;
const MAX_BYTES = 90_000;

const redis = () => Redis.fromEnv();
const lc = (u: string) => u.toLowerCase();
const code = (n: number) => Array.from({ length: n }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
export const validDesignId = (id: unknown) => typeof id === "string" && /^[a-z0-9]{8}$/.test(id);

export async function listDesigns(): Promise<BuiltDesign[]> {
  const all = (await redis().hgetall<Record<string, BuiltDesign>>(KEY)) || {};
  return Object.values(all).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getDesign(id: string): Promise<BuiltDesign | null> {
  if (!validDesignId(id)) return null;
  return (await redis().hget<BuiltDesign>(KEY, id)) || null;
}
async function put(d: BuiltDesign) {
  if (JSON.stringify(d).length > MAX_BYTES) throw new Error("This design is too big to save — take a few pieces out");
  await redis().hset(KEY, { [d.id]: d });
}

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 40) : "");

/** Make a new design or save changes to one of yours. */
export async function saveDesign(user: string, input: Record<string, unknown>, existing: BuiltDesign | null): Promise<BuiltDesign> {
  const now = new Date().toISOString();
  const name = cleanName(input.name) || existing?.name || "My design";
  const next: BuiltDesign = {
    id: existing?.id || "",
    name,
    emoji: typeof input.emoji === "string" && input.emoji.trim() ? input.emoji.trim().slice(0, 8) : existing?.emoji || "🎨",
    owner: existing?.owner || lc(user),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    description: typeof input.description === "string" ? input.description.replace(/\s+/g, " ").trim().slice(0, 160) || undefined : existing?.description,
    gallery: existing?.gallery,
    uses: existing?.uses,
    canvas: cleanCanvas(input.canvas ?? existing?.canvas),
    pieces: input.pieces !== undefined ? cleanPieces(input.pieces) : existing?.pieces || [],
  };
  if (!existing) {
    const mine = (await listDesigns()).filter((d) => d.owner === lc(user));
    if (mine.length >= MAX_DESIGNS) throw new Error(`You can keep up to ${MAX_DESIGNS} designs — delete one first`);
    let id = code(8);
    while (await getDesign(id)) id = code(8);
    next.id = id;
  } else if (existing.gallery === "approved" && JSON.stringify([existing.canvas, existing.pieces, existing.name]) !== JSON.stringify([next.canvas, next.pieces, next.name])) {
    // changes to a shared design get checked again before the gallery shows them
    next.gallery = "pending";
  }
  await put(next);
  return next;
}

export async function setGallery(d: BuiltDesign, state: BuiltDesign["gallery"]): Promise<BuiltDesign> {
  const next = { ...d, gallery: state };
  if (!state) delete next.gallery;
  await put(next);
  return next;
}

export async function countUse(d: BuiltDesign): Promise<void> {
  await put({ ...d, uses: (d.uses || 0) + 1 });
}

export async function deleteDesign(id: string): Promise<void> {
  await redis().hdel(KEY, id);
}

/** A copy of someone else's (shared) design that you can change. */
export async function copyDesign(user: string, d: BuiltDesign): Promise<BuiltDesign> {
  return saveDesign(user, { name: `${d.name} (copy)`.slice(0, 40), emoji: d.emoji, description: d.description, canvas: d.canvas, pieces: d.pieces }, null);
}
