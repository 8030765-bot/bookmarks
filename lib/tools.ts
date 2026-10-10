import { Redis } from "@upstash/redis";
import { bumpRev, userRevKey } from "./revs";

/**
 * Private data for the tools drawer: notes, to-dos, habits, flashcards and
 * countdowns. One hash per person (one field per tool) so a big flashcard
 * deck doesn't make every other settings save heavier.
 */
const key = (u: string) => `tooldata:${u.toLowerCase()}`;
/** which tools sync, and how much each may hold (bytes of JSON) */
export const TOOL_LIMITS: Record<string, number> = {
  notes: 20_000,
  todos: 20_000,
  habits: 20_000,
  flashcards: 120_000,
  countdowns: 5_000,
};
function getRedis() {
  return Redis.fromEnv();
}

export async function getToolData(username: string): Promise<Record<string, unknown>> {
  return ((await getRedis().hgetall<Record<string, unknown>>(key(username))) || {}) as Record<string, unknown>;
}

export async function setToolData(username: string, tool: string, value: unknown) {
  const max = TOOL_LIMITS[tool];
  if (!max) throw new Error("That tool doesn't save to your account");
  if (value === null || value === undefined) {
    await getRedis().hdel(key(username), tool);
  } else {
    const size = JSON.stringify(value).length;
    if (size > max) throw new Error(`That's too much to save (${Math.round(size / 1000)}k of ${max / 1000}k)`);
    await getRedis().hset(key(username), { [tool]: value });
  }
  await bumpRev(userRevKey(username));
}

export async function deleteToolData(username: string) {
  await getRedis().del(key(username));
}
export async function renameToolData(oldName: string, newName: string) {
  if (oldName.toLowerCase() === newName.toLowerCase()) return;
  const data = await getToolData(oldName);
  if (Object.keys(data).length) await getRedis().hset(key(newName), data);
  await deleteToolData(oldName);
}

/* ---------- typing test leaderboard ---------- */
const TYPING_KEY = "typing:best"; // hash: lowercase user -> best result
export interface TypingResult { user: string; wpm: number; accuracy: number; at: string }

/**
 * Save a typing result if it's your best. The numbers have to add up
 * (characters, time and speed agree) so the board isn't full of 9999 wpm.
 */
export async function submitTyping(user: string, input: Record<string, unknown>) {
  const chars = Number(input.chars);
  const ms = Number(input.ms);
  const accuracy = Math.round(Number(input.accuracy));
  if (!Number.isFinite(chars) || !Number.isFinite(ms) || chars < 50 || ms < 15_000 || ms > 600_000) throw new Error("Type for at least 15 seconds");
  if (!(accuracy >= 0 && accuracy <= 100)) throw new Error("Invalid result");
  const wpm = Math.round(chars / 5 / (ms / 60_000));
  if (wpm > 220) throw new Error("That's faster than anyone can type!");
  const redis = getRedis();
  const best = await redis.hget<TypingResult>(TYPING_KEY, user.toLowerCase());
  const result: TypingResult = { user, wpm, accuracy, at: new Date().toISOString() };
  const better = !best || wpm > best.wpm || (wpm === best.wpm && accuracy > best.accuracy);
  // only results with decent accuracy count for the board
  if (better && accuracy >= 85) await redis.hset(TYPING_KEY, { [user.toLowerCase()]: result });
  return { result, best: better && accuracy >= 85 ? result : best, counted: accuracy >= 85 };
}

export async function typingBoard(): Promise<TypingResult[]> {
  const raw = (await getRedis().hgetall<Record<string, TypingResult>>(TYPING_KEY)) || {};
  return Object.values(raw).sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy).slice(0, 20);
}
export async function removeTyping(user: string) {
  await getRedis().hdel(TYPING_KEY, user.toLowerCase());
}

/* ---------- dictionary lookups (cached so we don't ask twice) ---------- */
export interface Definition { word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] }
export async function define(word: string): Promise<Definition | null> {
  const w = word.trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,39}$/.test(w)) throw new Error("Type one English word");
  const redis = getRedis();
  const cacheKey = `define:${w}`;
  const cached = await redis.get<Definition | "none">(cacheKey);
  if (cached) return cached === "none" ? null : cached;
  let found: Definition | null = null;
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as { word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] }[];
      const first = json[0];
      if (first) {
        found = {
          word: first.word,
          phonetic: first.phonetic,
          meanings: json.flatMap((e) => e.meanings).slice(0, 4).map((m) => ({
            partOfSpeech: m.partOfSpeech,
            definitions: m.definitions.slice(0, 3).map((d) => ({ definition: d.definition, example: d.example })),
          })),
        };
      }
    } else if (res.status !== 404) {
      throw new Error("The dictionary isn't answering right now");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("The dictionary")) throw e;
    throw new Error("The dictionary isn't answering right now");
  }
  await redis.set(cacheKey, found || "none", { ex: 7 * 86400 });
  return found;
}
