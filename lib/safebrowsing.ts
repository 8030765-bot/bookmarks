import { createHash } from "crypto";
import { Redis } from "@upstash/redis";

/**
 * Checks new links against Google's list of known dangerous sites (Safe
 * Browsing). Only runs when GOOGLE_SAFE_BROWSING_KEY is set; otherwise every
 * link passes. Results are cached for a day.
 */
export async function findDangerous(urls: string[]): Promise<string[]> {
  const key = process.env.GOOGLE_SAFE_BROWSING_KEY;
  const list = Array.from(new Set(urls.filter(Boolean))).slice(0, 100);
  if (!key || !list.length) return [];
  const redis = Redis.fromEnv();
  const cacheKey = (u: string) => `sb:${createHash("sha1").update(u).digest("hex")}`;
  const cached = await Promise.all(list.map((u) => redis.get<string>(cacheKey(u))));
  const unknown = list.filter((_, i) => cached[i] === null || cached[i] === undefined);
  const bad = new Set(list.filter((_, i) => cached[i] === "bad"));
  if (unknown.length) {
    try {
      const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({
          client: { clientId: "theos-bookmarks", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: unknown.map((url) => ({ url })),
          },
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { matches?: { threat: { url: string } }[] };
        const hits = new Set((json.matches || []).map((m) => m.threat.url));
        for (const u of unknown) {
          if (hits.has(u)) bad.add(u);
          await redis.set(cacheKey(u), hits.has(u) ? "bad" : "ok", { ex: 86400 });
        }
      }
    } catch {
      // the check is a bonus: if Google doesn't answer, don't block people
    }
  }
  return list.filter((u) => bad.has(u));
}
