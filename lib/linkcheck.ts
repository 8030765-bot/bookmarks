import { Redis } from "@upstash/redis";
import { safeFetchText } from "./safefetch";

/**
 * Checks whether links still load. Runs a small batch at a time (so one
 * request never takes too long) and remembers each result for the admins.
 * Uses the same guarded fetch as link previews: no private addresses.
 */
export interface CheckResult { ok: boolean; status: number; at: string; finalUrl?: string; error?: string; httpsOk?: boolean }
const KEY = "linkcheck"; // hash: linkId -> CheckResult
function getRedis() {
  return Redis.fromEnv();
}

async function checkOne(url: string): Promise<CheckResult> {
  const at = new Date().toISOString();
  try {
    const page = await safeFetchText(url, { maxBytes: 4096, timeoutMs: 6000 });
    const ok = page.status < 400 || page.status === 401 || page.status === 403; // sign-in pages still "work"
    const out: CheckResult = { ok, status: page.status, at, finalUrl: page.url !== url ? page.url : undefined };
    // http links: would the https version work?
    if (url.startsWith("http://")) {
      try {
        const https = await safeFetchText(url.replace(/^http:/, "https:"), { maxBytes: 2048, timeoutMs: 5000 });
        out.httpsOk = https.status < 400;
      } catch {
        out.httpsOk = false;
      }
    }
    return out;
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    return { ok: false, status: 0, at, error: /abort|timeout/i.test(message) ? "took too long" : message.slice(0, 120) };
  }
}

/** Check up to `max` links (the ones checked longest ago first). */
export async function checkBatch(links: { id: string; url: string }[], max = 8) {
  const redis = getRedis();
  const done = ((await redis.hgetall<Record<string, CheckResult>>(KEY)) || {}) as Record<string, CheckResult>;
  const queue = [...links].sort((a, b) => (done[a.id]?.at || "").localeCompare(done[b.id]?.at || "")).slice(0, Math.max(1, Math.min(20, max)));
  const results = await Promise.all(queue.map(async (l) => [l.id, await checkOne(l.url)] as const));
  if (results.length) await redis.hset(KEY, Object.fromEntries(results));
  // forget results for links that no longer exist
  const live = new Set(links.map((l) => l.id));
  const stale = Object.keys(done).filter((id) => !live.has(id));
  if (stale.length) await redis.hdel(KEY, ...stale);
  return { checked: results.length, results: await allResults() };
}
export async function allResults(): Promise<Record<string, CheckResult>> {
  return ((await getRedis().hgetall<Record<string, CheckResult>>(KEY)) || {}) as Record<string, CheckResult>;
}
