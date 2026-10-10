import { Redis } from "@upstash/redis";
import { BookmarksData } from "./types";

/**
 * Automatic daily backups of the shared list: the first save of each day
 * keeps a copy of how things were before it, for 14 days. Admins can look
 * at what changed and restore any of them.
 */
const INDEX_KEY = "backups:index"; // list of days, newest first
const dayKey = (day: string) => `backup:${day}`;
const KEEP_DAYS = 14;
function getRedis() {
  return Redis.fromEnv();
}

/** Called before every save with the copy that's about to be replaced. */
export async function backupIfNeeded(existing: BookmarksData | null) {
  if (!existing || !Array.isArray(existing.folders)) return;
  const redis = getRedis();
  const day = new Date().toISOString().slice(0, 10);
  // SET NX: only the first save of the day keeps a copy
  const fresh = await redis.set(dayKey(day), { at: new Date().toISOString(), data: existing }, { nx: true, ex: KEEP_DAYS * 86400 });
  if (!fresh) return;
  await redis.lpush(INDEX_KEY, day);
  await redis.ltrim(INDEX_KEY, 0, KEEP_DAYS - 1);
}

export interface BackupInfo { day: string; at: string; folders: number; links: number }
export async function listBackups(): Promise<BackupInfo[]> {
  const redis = getRedis();
  const days = Array.from(new Set(await redis.lrange<string>(INDEX_KEY, 0, KEEP_DAYS - 1)));
  const rows = await Promise.all(days.map((d) => redis.get<{ at: string; data: BookmarksData }>(dayKey(d))));
  return days.flatMap((day, i) => {
    const r = rows[i];
    if (!r?.data?.folders) return [];
    return [{ day, at: r.at, folders: r.data.folders.length, links: r.data.folders.reduce((n, f) => n + (f.links?.length || 0), 0) }];
  });
}
export async function getBackup(day: string): Promise<BookmarksData | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Pick a backup");
  return (await getRedis().get<{ data: BookmarksData }>(dayKey(day)))?.data || null;
}

/** What's different between a backup and now (for the "what changed" view). */
export function diffData(before: BookmarksData, after: BookmarksData) {
  const linksOf = (d: BookmarksData) => new Map(d.folders.flatMap((f) => f.links.map((l) => [l.id, { name: l.name, url: l.url, folder: f.name }] as const)));
  const a = linksOf(before), b = linksOf(after);
  const added = Array.from(b.entries()).filter(([id]) => !a.has(id)).map(([, l]) => l);
  const removed = Array.from(a.entries()).filter(([id]) => !b.has(id)).map(([, l]) => l);
  const changed = Array.from(b.entries()).filter(([id, l]) => a.has(id) && (a.get(id)!.name !== l.name || a.get(id)!.url !== l.url || a.get(id)!.folder !== l.folder))
    .map(([id, l]) => ({ before: a.get(id)!, after: l }));
  const fa = new Set(before.folders.map((f) => f.name)), fb = new Set(after.folders.map((f) => f.name));
  return {
    added, removed, changed,
    foldersAdded: Array.from(fb).filter((n) => !fa.has(n)),
    foldersRemoved: Array.from(fa).filter((n) => !fb.has(n)),
  };
}
