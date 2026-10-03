import { Redis } from "@upstash/redis";

/**
 * Tiny counters that change whenever a piece of shared state changes.
 * Clients poll all of them with one cheap MGET (/api/sync) and only
 * re-download the big data when its counter moved.
 */
export const REV_KEYS = {
  bookmarks: "rev:bookmarks",
  chat: "rev:chat",
  ratings: "rev:ratings",
  suggestions: "rev:suggestions",
} as const;
export type RevName = keyof typeof REV_KEYS;
export const userRevKey = (username: string) => `rev:user:${username.toLowerCase()}`;

export async function bumpRev(key: string) {
  try {
    await Redis.fromEnv().incr(key);
  } catch {
    // a missed bump only delays a refresh until the next change
  }
}
