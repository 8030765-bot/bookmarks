import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";

/**
 * Small pictures people upload: profile pictures, profile banners, chat
 * images and custom link icons. The page shrinks them before uploading, so
 * each one is tens of KB and fits in the database as base64. New pictures
 * wait for a moderator (unless staff uploaded them); only the person who
 * uploaded a waiting picture and staff can see it.
 */
export type ImageKind = "avatar" | "banner" | "chat" | "icon";
export type ImageType = "image/webp" | "image/jpeg" | "image/png" | "image/gif";
export interface ImageMeta {
  id: string;
  owner: string;
  kind: ImageKind;
  type: ImageType;
  bytes: number;
  at: string;
  status: "pending" | "ok";
  /** a still first frame, for animated GIFs */
  still?: string;
  /** what it's for, e.g. the link an icon belongs to */
  ref?: string;
}
interface Stored extends ImageMeta { data: string }

const LIMITS: Record<ImageKind, number> = { avatar: 80_000, banner: 220_000, chat: 400_000, icon: 40_000 };
const GIF_LIMIT = 450_000;
const PENDING_KEY = "img:pending"; // sorted set: id -> upload time
const MAX_PENDING_PER_USER = 6;
const key = (id: string) => `img:${id}`;
const redis = () => Redis.fromEnv();

/** The real type from the first bytes — never trust what the browser said. */
export function sniffType(buf: Uint8Array): ImageType | null {
  const s = (a: number, b: number) => String.fromCharCode(...Array.from(buf.subarray(a, b)));
  if (buf[0] === 0x89 && s(1, 4) === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (s(0, 4) === "GIF8") return "image/gif";
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Turn a data: URL into checked bytes. */
export function parseDataUrl(dataUrl: unknown, kind: ImageKind): { type: ImageType; base64: string; bytes: number } {
  const m = /^data:image\/(webp|jpeg|png|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw new Error("That isn't a picture this site can use (PNG, JPEG, WebP or GIF)");
  const buf = Buffer.from(m[2], "base64");
  const type = sniffType(buf);
  if (!type) throw new Error("That file isn't really a picture");
  const limit = type === "image/gif" ? GIF_LIMIT : LIMITS[kind];
  if (buf.length > limit) throw new Error(`That picture is too big (max ${Math.round(limit / 1000)} KB)`);
  return { type, base64: buf.toString("base64"), bytes: buf.length };
}

export async function saveImage(owner: string, kind: ImageKind, dataUrl: unknown, opts: { approved?: boolean; still?: string; ref?: string; queue?: boolean } = {}): Promise<ImageMeta> {
  const { type, base64, bytes } = parseDataUrl(dataUrl, kind);
  if (type === "image/gif" && kind !== "avatar" && kind !== "chat") throw new Error("Moving pictures only work as a profile picture or in chat");
  if (!opts.approved) {
    const mine = (await listPending()).filter((p) => p.owner.toLowerCase() === owner.toLowerCase());
    if (mine.length >= MAX_PENDING_PER_USER) throw new Error("You have lots of pictures waiting for a moderator already — try again later");
  }
  const meta: ImageMeta = {
    id: uuid().replace(/-/g, ""), owner, kind, type, bytes, at: new Date().toISOString(),
    status: opts.approved ? "ok" : "pending", still: opts.still, ref: opts.ref,
  };
  await redis().set(key(meta.id), { ...meta, data: base64 } satisfies Stored);
  // a GIF's still frame rides along with the GIF instead of being queued itself
  if (!opts.approved && opts.queue !== false) await redis().zadd(PENDING_KEY, { score: Date.now(), member: meta.id });
  return meta;
}

export async function getImage(id: string): Promise<Stored | null> {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  return redis().get<Stored>(key(id));
}
export async function getImageMeta(id: string): Promise<ImageMeta | null> {
  const s = await getImage(id);
  if (!s) return null;
  const { data: _d, ...meta } = s;
  return meta;
}

export async function setImageStatus(id: string, status: "ok") {
  const s = await getImage(id);
  if (!s) return null;
  s.status = status;
  await redis().set(key(id), s);
  await redis().zrem(PENDING_KEY, id);
  if (s.still) await setImageStatus(s.still, status);
  const { data: _d, ...meta } = s;
  return meta;
}

export async function deleteImage(id: string | undefined) {
  if (!id || !/^[a-f0-9]{32}$/.test(id)) return;
  const s = await getImage(id);
  await redis().del(key(id));
  await redis().zrem(PENDING_KEY, id);
  if (s?.still && s.still !== id) await deleteImage(s.still);
}

/** Pictures waiting for a moderator, oldest first (without the picture data). */
export async function listPending(): Promise<ImageMeta[]> {
  const ids = await redis().zrange<string[]>(PENDING_KEY, 0, 99);
  if (!ids.length) return [];
  const all = await redis().mget<(Stored | null)[]>(...ids.map(key));
  const out: ImageMeta[] = [];
  const gone: string[] = [];
  all.forEach((s, i) => {
    if (!s) { gone.push(ids[i]); return; }
    const { data: _d, ...meta } = s;
    out.push(meta);
  });
  if (gone.length) await redis().zrem(PENDING_KEY, ...gone);
  return out;
}
