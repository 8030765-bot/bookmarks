/**
 * Quiet hours ("no pop-ups, sounds or phone alerts 9pm–7am"), worked out in
 * the person's own time zone so the server agrees with their clock.
 * Shared by the server (phone alerts) and the page (pop-ups and sounds).
 */
export interface QuietHours { from: string; to: string; tz: string }

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const mins = (t: string) => { const m = HHMM.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

export function cleanQuietHours(v: unknown): QuietHours | undefined {
  if (!v || typeof v !== "object") return undefined;
  const q = v as Record<string, unknown>;
  const from = String(q.from || "");
  const to = String(q.to || "");
  let tz = String(q.tz || "UTC").slice(0, 60);
  if (!HHMM.test(from) || !HHMM.test(to) || from === to) return undefined;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); } catch { tz = "UTC"; }
  return { from, to, tz };
}

/** The time of day (minutes after midnight) in a time zone. */
function minutesIn(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return (h % 24) * 60 + m;
}

export function inQuietHours(q: QuietHours | undefined | null, now = new Date()): boolean {
  if (!q) return false;
  const a = mins(q.from);
  const b = mins(q.to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  let t: number;
  try { t = minutesIn(q.tz, now); } catch { return false; }
  // 21:00–07:00 wraps past midnight
  return a < b ? t >= a && t < b : t >= a || t < b;
}
