// Change counters, visit counts, retries, rate limits, security checks, health.
import { ADMIN_PW, BASE, bm, call, done, me, ok, setQuota, signup, sleep, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("sam", "tia");
const sync = async (u) => (await call("anon", `/api/sync${u ? `?u=${u}` : ""}`)).json;

// change counters
let s0 = await sync("sam");
ok("sync returns every counter", ["bookmarks", "chat", "ratings", "suggestions", "user"].every((k) => typeof s0[k] === "number"), JSON.stringify(s0));
let r = await bm("sam", { action: "addFolder", name: "Sync", emoji: "📁" });
const fid = r.json.folders.find((f) => f.name === "Sync").id;
let s1 = await sync("sam");
ok("bookmarks counter moves on a change", s1.bookmarks > s0.bookmarks && s1.bookmarks === r.json.rev, `${s0.bookmarks} -> ${s1.bookmarks} (data rev ${r.json.rev})`);
r = await bm("sam", { action: "addLink", folderId: fid, name: "Counter", url: "counter.example.com" });
const link = r.json.folders.find((f) => f.id === fid).links[0];
await call("sam", "/api/chat", { text: "hello @tia" });
let s2 = await sync("tia");
ok("chat counter moves on a message", s2.chat > s1.chat);
ok("the mentioned person's counter moves", s2.user > 0, String(s2.user));
await me("tia", { action: "rate", linkId: link.id, stars: 4 });
ok("ratings counter moves on a rating", (await sync()).ratings > s2.ratings);
await call("sam", "/api/suggestions", { kind: "other", note: "more themes please" });
ok("suggestions counter moves on a suggestion", (await sync()).suggestions > s2.suggestions);

// visits are stored separately and don't make every page reload
const before = (await sync()).bookmarks;
for (let i = 0; i < 3; i++) await bm("tia", { action: "trackClick", folderId: fid, linkId: link.id });
ok("a visit doesn't bump the bookmarks counter", (await sync()).bookmarks === before);
r = await call("anon", "/api/bookmarks");
ok("visits show up in the list", r.json.folders.find((f) => f.id === fid).links[0].clicks === 3, String(r.json.folders.find((f) => f.id === fid).links[0].clicks));
r = await bm("sam", { action: "editLink", folderId: fid, linkId: link.id, name: "Counter 2", password: ADMIN_PW });
ok("admin edits keep the visit count", r.json.folders.find((f) => f.id === fid).links[0].clicks === 3);
r = await bm("sam", { action: "resetClicks", password: ADMIN_PW });
r = await call("anon", "/api/bookmarks");
ok("reset clears visit counts", !r.json.folders.find((f) => f.id === fid).links[0].clicks);

// retried saves apply once
const opId = "retry-test-1234";
await bm("sam", { action: "addLink", folderId: fid, name: "Once", url: "once.example.com", opId });
r = await bm("sam", { action: "addLink", folderId: fid, name: "Once", url: "once.example.com", opId });
ok("same opId is applied only once", r.json.folders.find((f) => f.id === fid).links.filter((l) => l.name === "Once").length === 1);
r = await bm("sam", { action: "addLink", folderId: "nope", name: "Fail", url: "fail.example.com", opId: "failing-op-123" });
ok("a failed change reports its error", r.status === 400, r.json.error);
r = await bm("sam", { action: "addLink", folderId: fid, name: "Fail", url: "fail.example.com", opId: "failing-op-123" });
ok("…and the same id can then be retried", r.json.folders?.find((f) => f.id === fid).links.some((l) => l.name === "Fail"));

// rate limit on visits
let limited = false;
// 250 clicks: even split across two one-minute windows, one of them goes over 120
for (let i = 0; i < 250 && !limited; i++) {
  const rr = await bm("clicker", { action: "trackClick", folderId: fid, linkId: link.id });
  if (rr.status === 429) limited = true;
}
ok("visits are rate-limited per address", limited);

// cross-site and non-JSON writes are blocked
r = await call("sam", "/api/bookmarks", { action: "addFolder", name: "Evil" }, "POST", { Origin: "https://evil.example" });
ok("cross-site POST blocked", r.status === 403, r.json.error);
const form = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "text=hi" });
ok("form posts blocked", form.status === 415);

// security headers
const page = await fetch(`${BASE}/`);
ok("CSP header set", (page.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"));
ok("clickjacking protection", page.headers.get("x-frame-options") === "DENY");
ok("no x-powered-by", !page.headers.get("x-powered-by"));

// health + quota handling
r = await call("anon", "/api/health");
ok("health check ok", r.status === 200 && r.json.ok && r.json.db === "ok", JSON.stringify(r.json));
await setQuota(true);
r = await call("anon", "/api/bookmarks");
ok("quota: list says so (503 + quota flag)", r.status === 503 && r.json.quota === true, JSON.stringify(r.json));
r = await call("anon", "/api/sync");
ok("quota: sync says so", r.status === 503 && r.json.quota === true);
r = await call("anon", "/api/health");
ok("quota: health reports it", r.json.db === "quota", r.json.db);
await setQuota(false);
await sleep(50);
r = await call("anon", "/api/health");
ok("recovers when the limit resets", r.json.db === "ok");

done();
