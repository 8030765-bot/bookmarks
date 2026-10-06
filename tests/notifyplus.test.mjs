// Notification extras: quiet hours (stored per person, in their time zone,
// and the clock maths itself), snoozing a notification until later.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { ADMIN_PW, adm, done, me, ok, signup, waitForServer } from "./helpers.mjs";

/* ---------- the quiet-hours clock maths (lib/quiet.ts, compiled on the fly) ---------- */
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "..", "lib", "quiet.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { inQuietHours, cleanQuietHours } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const at = (iso) => new Date(iso);
const night = { from: "21:00", to: "07:00", tz: "UTC" };
ok("21:00–07:00 covers 23:30", inQuietHours(night, at("2026-10-05T23:30:00Z")));
ok("…and 06:59", inQuietHours(night, at("2026-10-05T06:59:00Z")));
ok("…but not 07:00", !inQuietHours(night, at("2026-10-05T07:00:00Z")));
ok("…or midday", !inQuietHours(night, at("2026-10-05T12:00:00Z")));
ok("a daytime window works too", inQuietHours({ from: "09:00", to: "15:00", tz: "UTC" }, at("2026-10-05T10:00:00Z")));
ok("time zones count: 22:00 in London is 21:00 UTC (summer)", inQuietHours({ from: "22:00", to: "23:00", tz: "Europe/London" }, at("2026-07-01T21:30:00Z")));
ok("…and New York is hours behind", !inQuietHours({ from: "22:00", to: "23:00", tz: "America/New_York" }, at("2026-07-01T21:30:00Z")));
ok("bad times are refused", cleanQuietHours({ from: "25:00", to: "07:00", tz: "UTC" }) === undefined && cleanQuietHours({ from: "07:00", to: "07:00", tz: "UTC" }) === undefined);
ok("unknown time zones fall back to UTC", cleanQuietHours({ from: "21:00", to: "07:00", tz: "Mars/Olympus" })?.tz === "UTC");

/* ---------- stored per person ---------- */
await waitForServer();
await signup("owner1", "kai", "ben");
await adm("owner1", { action: "claimOwner", password: ADMIN_PW });
let r = await me("kai", { action: "quietHours", quietHours: { from: "21:30", to: "07:15", tz: "Europe/London" } });
ok("set quiet hours", r.json.quietHours?.from === "21:30" && r.json.quietHours.tz === "Europe/London", JSON.stringify(r.json));
r = await me("kai");
ok("…they come back with your data", r.json.quietHours?.to === "07:15");
r = await me("kai", { action: "quietHours", quietHours: null });
ok("turn them off", r.json.quietHours === null);

/* ---------- snooze ---------- */
await me("ben", { action: "follow", username: "kai", on: true });
r = await me("kai");
const n = r.json.notifications[0];
await me("kai", { action: "readNotifications", id: n.id });
const later = new Date(Date.now() + 3 * 3600_000).toISOString();
r = await me("kai", { action: "snoozeNotification", id: n.id, until: later });
const s = r.json.notifications?.find((x) => x.id === n.id);
ok("snooze a notification", s?.snoozeUntil === later && s.read === false, JSON.stringify(r.json));
r = await me("kai", { action: "snoozeNotification", id: n.id, until: new Date(Date.now() - 1000).toISOString() });
ok("…not into the past", r.status === 400);
r = await me("kai", { action: "snoozeNotification", id: n.id, until: new Date(Date.now() + 30 * 86400_000).toISOString() });
ok("…or more than a week ahead", r.status === 400);
r = await me("kai", { action: "snoozeNotification", id: "nope", until: later });
ok("…and only your own notifications", r.status === 400);

done();
