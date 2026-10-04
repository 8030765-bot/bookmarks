import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";
import { notify } from "./userdata";
import { REV_KEYS, bumpRev } from "./revs";

/**
 * Messages for the admins: bug reports and "contact an admin", plus the
 * quick 😀 😐 🙁 on each page (counted, not stored per person).
 */
export interface FeedbackItem {
  id: string;
  kind: "bug" | "contact";
  text: string;
  user?: string;
  page?: string;
  device?: string;
  at: string;
  reply?: { by: string; text: string; at: string };
}
const KEY = "feedback";
const RATINGS_KEY = "pagefeedback"; // hash: "<page>|<good|ok|bad>" -> count
function getRedis() {
  return Redis.fromEnv();
}
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function sendFeedback(user: string | null, input: Record<string, unknown>) {
  const kind = input.kind === "contact" ? "contact" : input.kind === "bug" ? "bug" : null;
  if (!kind) throw new Error("Pick what kind of message it is");
  const text = clean(input.text, 2000);
  if (text.length < 5) throw new Error("Write a little more so we know what you mean");
  if (kind === "contact" && !user) throw new Error("Log in to message an admin, so they can reply");
  const item: FeedbackItem = {
    id: uuid(), kind, text, user: user || undefined, at: new Date().toISOString(),
    page: clean(input.page, 200) || undefined, device: clean(input.device, 200) || undefined,
  };
  await getRedis().hset(KEY, { [item.id]: item });
  await bumpRev(REV_KEYS.suggestions);
  return item;
}
export async function listFeedback(): Promise<FeedbackItem[]> {
  const raw = ((await getRedis().hgetall<Record<string, FeedbackItem>>(KEY)) || {}) as Record<string, FeedbackItem>;
  return Object.values(raw).sort((a, b) => b.at.localeCompare(a.at));
}
export async function replyFeedback(id: string, by: string, text: string) {
  const item = await getRedis().hget<FeedbackItem>(KEY, id);
  if (!item) throw new Error("That message is gone");
  const t = text.trim().slice(0, 1000);
  if (!t) throw new Error("Write a reply first");
  item.reply = { by, text: t, at: new Date().toISOString() };
  await getRedis().hset(KEY, { [id]: item });
  if (item.user) await notify(item.user, { kind: "system", from: by, text: `💬 An admin replied to your ${item.kind === "bug" ? "bug report" : "message"}: “${t.slice(0, 200)}”` });
  return item;
}
export async function deleteFeedback(id: string) {
  await getRedis().hdel(KEY, id);
  await bumpRev(REV_KEYS.suggestions);
}

/* ---------- 😀 😐 🙁 on each page ---------- */
export async function ratePage(page: string, value: string) {
  if (!["good", "ok", "bad"].includes(value)) throw new Error("Pick a face");
  const p = page.replace(/[?#].*$/, "").replace(/[^\w/-]/g, "").slice(0, 60) || "/";
  await getRedis().hincrby(RATINGS_KEY, `${p}|${value}`, 1);
}
export async function pageRatings(): Promise<Record<string, { good: number; ok: number; bad: number }>> {
  const raw = ((await getRedis().hgetall<Record<string, number>>(RATINGS_KEY)) || {}) as Record<string, number>;
  const out: Record<string, { good: number; ok: number; bad: number }> = {};
  for (const [k, n] of Object.entries(raw)) {
    const [page, v] = k.split("|");
    out[page] ||= { good: 0, ok: 0, bad: 0 };
    out[page][v as "good" | "ok" | "bad"] = Number(n);
  }
  return out;
}
