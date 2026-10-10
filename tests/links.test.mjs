// Link extras, bulk add, personal link notes, rating breakdown, page lookups.
import { ADMIN_PW, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("kid", "kid2");
const admin = (b) => bm("admin", { ...b, password: ADMIN_PW });
const folderOf = (j, id) => j.folders.find((f) => f.id === id);

let r = await admin({ action: "addFolder", name: "Extras", emoji: "🧪" });
const fid = r.json.folders.find((f) => f.name === "Extras").id;
r = await admin({ action: "addFolder", name: "Other", emoji: "📁" });
const other = r.json.folders.find((f) => f.name === "Other").id;

// tracking junk is removed from links
r = await bm("kid", { action: "addLink", folderId: fid, name: "Tracked", url: "https://example.com/page?utm_source=x&id=7&fbclid=abc" });
let link = folderOf(r.json, fid).links.find((l) => l.name === "Tracked");
ok("utm_ / fbclid stripped, real params kept", link?.url === "https://example.com/page?id=7", link?.url);
r = await bm("kid", { action: "addLink", folderId: fid, name: "YT", url: "https://www.youtube.com/watch?v=abc&si=TRACK" });
ok("YouTube share id stripped", folderOf(r.json, fid).links.find((l) => l.name === "YT")?.url === "https://www.youtube.com/watch?v=abc");

// members can describe a link but not pin / verify / keyword it
r = await bm("kid", {
  action: "addLink", folderId: fid, name: "Member", url: "member.example.com",
  emoji: "🧮", tip: "Sign in first", lang: "es", cost: "account", mobile: true, readMins: 4.4,
  checklist: ["Step one", "", "Step two"], related: [{ name: "Video", url: "video.example.com" }, { name: "Bad", url: "javascript:x" }],
  pinned: true, verified: true, keyword: "member", sticker: "hot", status: "broken", alsoIn: [other],
});
link = folderOf(r.json, fid).links.find((l) => l.name === "Member");
ok("descriptive extras saved", link.emoji === "🧮" && link.tip === "Sign in first" && link.lang === "es" && link.cost === "account" && link.mobile === true && link.readMins === 4,
  JSON.stringify({ e: link.emoji, t: link.tip, l: link.lang, c: link.cost, m: link.mobile, r: link.readMins }));
ok("checklist cleaned", JSON.stringify(link.checklist) === '["Step one","Step two"]');
ok("related links keep only web links", link.related?.length === 1 && link.related[0].url === "https://video.example.com/", JSON.stringify(link.related));
ok("admin-only fields ignored for members", !link.pinned && !link.verified && !link.keyword && !link.sticker && !link.status && !link.alsoIn,
  JSON.stringify({ p: link.pinned, v: link.verified, k: link.keyword, s: link.sticker, st: link.status, a: link.alsoIn }));

// admins can set them (and junk values are dropped)
r = await admin({
  action: "editLink", folderId: fid, linkId: link.id,
  pinned: true, verified: true, keyword: "Mem Ber!", sticker: "essential", status: "login", expiresAt: "2099-01-01", alsoIn: [other, "nope"],
});
link = folderOf(r.json, fid).links.find((l) => l.id === link.id);
ok("admin extras saved", link.pinned && link.verified && link.keyword === "member" && link.sticker === "essential" && link.status === "login",
  JSON.stringify({ p: link.pinned, v: link.verified, k: link.keyword, s: link.sticker, st: link.status }));
ok("expiry stored as a date", link.expiresAt?.startsWith("2099-01-01"), link.expiresAt);
ok("also-in keeps only real folders", JSON.stringify(link.alsoIn) === JSON.stringify([other]), JSON.stringify(link.alsoIn));
r = await admin({ action: "editLink", folderId: fid, linkId: link.id, status: "bogus", cost: "lots", lang: "english" });
link = folderOf(r.json, fid).links.find((l) => l.id === link.id);
ok("invalid labels cleared", !link.status && !link.cost && !link.lang, JSON.stringify({ s: link.status, c: link.cost, l: link.lang }));
const tracked = folderOf(r.json, fid).links.find((l) => l.name === "Tracked");
r = await admin({ action: "editLink", folderId: fid, linkId: tracked.id, keyword: "member" });
ok("keywords must be unique", r.status === 400 && /already used/.test(r.json.error), r.json.error);
r = await admin({ action: "editLink", folderId: fid, linkId: link.id, keyword: "", alsoIn: [], expiresAt: "" });
link = folderOf(r.json, fid).links.find((l) => l.id === link.id);
ok("clearing admin extras works", !link.keyword && !link.alsoIn && !link.expiresAt);

// bulk add
r = await bm("kid", {
  action: "addLinks", folderId: fid,
  links: [{ name: "One", url: "one.example.com" }, { name: "Two", url: "https://two.example.com" }, { name: "Dup", url: "https://example.com/page?id=7" }, { name: "Bad", url: "javascript:1" }],
  tags: ["Bulk"],
});
const names = folderOf(r.json, fid).links.map((l) => l.name);
ok("bulk add adds the new ones", names.includes("One") && names.includes("Two"), names.join(","));
ok("bulk add skips duplicates and bad links", !names.includes("Dup") && !names.includes("Bad"));
ok("bulk add tags them", folderOf(r.json, fid).links.find((l) => l.name === "One")?.tags?.[0] === "bulk");
r = await bm("kid", { action: "addLinks", folderId: fid, links: [{ name: "Again", url: "one.example.com" }] });
ok("bulk add with nothing new says so", r.status === 400, r.json.error);
r = await bm("kid", { action: "addLinks", folderId: fid, links: Array.from({ length: 70 }, (_, i) => ({ name: `L${i}`, url: `l${i}.example.com` })) });
ok("bulk add stops at 50", folderOf(r.json, fid).links.filter((l) => /^L\d+$/.test(l.name)).length === 50);

// personal link notes
r = await me("kid", { action: "linkPref", linkId: link.id, patch: { note: "  my secret  ", later: true, checks: [1, 1, 0, 99, -1] } });
ok("private note + read later saved", r.json.links?.[link.id]?.note === "my secret" && r.json.links[link.id].later === true, JSON.stringify(r.json.links?.[link.id]));
ok("checklist ticks cleaned", JSON.stringify(r.json.links?.[link.id]?.checks) === "[0,1]", JSON.stringify(r.json.links?.[link.id]?.checks));
r = await me("kid", { action: "linkPref", linkId: link.id, patch: { done: true, rename: "Mine" } });
ok("prefs merge", r.json.links[link.id].note === "my secret" && r.json.links[link.id].done && r.json.links[link.id].rename === "Mine");
r = await me("kid", { action: "linkPref", linkId: link.id, patch: { note: "", later: false, done: false, rename: "", checks: [] } });
ok("clearing everything removes the entry", !(link.id in r.json.links), JSON.stringify(r.json.links));
r = await me("kid", { action: "linkPref", linkId: "../../etc", patch: { note: "x" } });
ok("bad link ids rejected", r.status === 400);
await me("kid", { action: "linkPref", linkId: link.id, patch: { hidden: true } });
r = await call("kid2", "/api/me");
ok("prefs are private to the account", !r.json.links?.[link.id]);
r = await me("nobody", { action: "linkPref", linkId: link.id, patch: { note: "x" } });
ok("logged-out can't save prefs", r.status === 401);

// rating breakdown
await me("kid", { action: "rate", linkId: link.id, stars: 5 });
await me("kid2", { action: "rate", linkId: link.id, stars: 3 });
await me("kid2", { action: "rate", linkId: link.id, stars: 4 });
r = await call("x", "/api/ratings");
ok("ratings include a star breakdown", JSON.stringify(r.json.ratings[link.id]?.hist) === "[0,0,0,1,1]", JSON.stringify(r.json.ratings[link.id]));

// page lookups are logged-in only and never reach private addresses
r = await call("anon", `/api/meta?url=${encodeURIComponent("https://example.com")}`);
ok("page lookup needs login", r.status === 401);
for (const bad of ["http://127.0.0.1/", "http://localhost:3456/api/health", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://0.0.0.0/", "http://example.com:8080/", "http://user:pw@example.com/"]) {
  r = await call("kid", `/api/meta?url=${encodeURIComponent(bad)}`);
  ok(`blocked: ${bad}`, r.status === 400, `${r.status} ${r.json.error}`);
}
r = await call("kid", `/api/meta?url=${encodeURIComponent("javascript:alert(1)")}`);
ok("page lookup rejects non-web links", r.status === 400);

// icon route only takes real-looking host names
r = await call("anon", "/api/icon?d=../../etc/passwd");
ok("icon route rejects junk", r.status === 400);
r = await call("anon", "/api/icon?d=localhost");
ok("icon route rejects single names", r.status === 400);

done();
