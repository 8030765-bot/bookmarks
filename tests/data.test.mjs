// Data: backups, CSV import, duplicates, health fixes, https, link checker,
// edit conflicts, public JSON + feeds + calendar, embeds, personal import.
import { ADMIN_PW, BASE, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("root", "ivy", "jay");
await adm("root", { action: "claimOwner", password: ADMIN_PW });

let r = await bm("root", { action: "addFolder", name: "Science", emoji: "🔬" });
const sci = r.json.folders.find((f) => f.name === "Science").id;
ok("data has a format version", r.json.schema === 2, String(r.json.schema));

/* ---------- daily backups ---------- */
await bm("root", { action: "addLink", folderId: sci, name: "PhET", url: "phet.example.com" });
r = await adm("root", { action: "backups" });
const today = new Date().toISOString().slice(0, 10);
ok("a daily backup is kept", r.json.backups?.some((b) => b.day === today), JSON.stringify(r.json));
r = await adm("root", { action: "backupDiff", day: today });
ok("see what changed since the backup", r.json.diff.added.some((l) => l.name === "PhET"), JSON.stringify(r.json.diff));
r = await bm("root", { action: "restoreBackup", day: today });
ok("restoring needs typing RESTORE", r.status === 400);
r = await bm("root", { action: "restoreBackup", day: today, confirm: "RESTORE" });
ok("restore a backup", r.status === 200 && !r.json.folders.some((f) => f.links?.some((l) => l.name === "PhET")), JSON.stringify(r.json.error));
r = await bm("root", { action: "undo" });
ok("…and undo the restore", r.json.folders.find((f) => f.id === sci)?.links.some((l) => l.name === "PhET"));

/* ---------- CSV import, duplicates, health ---------- */
r = await bm("root", { action: "importCsv", rows: [
  { name: "Desmos", url: "desmos.example.com", folder: "Maths", tags: ["graphs"] },
  { name: "PhET again", url: "https://phet.example.com", folder: "Science" },
  { name: "", url: "geogebra.example.com", folder: "maths" },
] });
const maths = r.json.folders.find((f) => f.name === "Maths");
ok("CSV import makes folders by name and skips links already there", maths?.links.length === 2 && r.json.folders.find((f) => f.id === sci).links.length === 1, JSON.stringify(maths));
ok("…uses the address when there's no name, and keeps tags", maths.links.some((l) => l.name.includes("geogebra")) && maths.links.find((l) => l.name === "Desmos").tags[0] === "graphs");
await bm("root", { action: "addLink", folderId: maths.id, name: "PhET (maths)", url: "http://www.phet.example.com/", tags: ["sim"] });
r = await bm("root", { action: "mergeDuplicates" });
const kept = r.json.folders.find((f) => f.id === sci).links.find((l) => l.name === "PhET");
ok("merge duplicates keeps the oldest with tags and shows it in both folders", !r.json.folders.find((f) => f.id === maths.id).links.some((l) => l.name === "PhET (maths)") && kept.tags.includes("sim") && kept.alsoIn?.includes(maths.id), JSON.stringify(kept));
r = await adm("root", { action: "overview" });
ok("…the extra copy is in the trash", r.json.trash.some((t) => t.item.name === "PhET (maths)"));
r = await bm("root", { action: "mergeDuplicates" });
ok("nothing left to merge", r.status === 400);
await bm("root", { action: "addFolder", name: "Empty one", emoji: "📭" });
r = await bm("root", { action: "healthFix", fix: "emptyFolders" });
ok("health check removes empty folders", !r.json.folders.some((f) => f.name === "Empty one"));
await bm("root", { action: "addLink", folderId: sci, name: "Old site", url: "http://old.example.com" });
r = await bm("root", { action: "httpsUpgrade" });
ok("switch http links to https", r.json.folders.find((f) => f.id === sci).links.find((l) => l.name === "Old site").url.startsWith("https://"));

/* ---------- link checker ---------- */
await bm("root", { action: "addLink", folderId: sci, name: "Gone", url: "https://nothing-here.invalid" });
r = await call("root", "/api/bookmarks");
const gone = r.json.folders.find((f) => f.id === sci).links.find((l) => l.name === "Gone");
r = await adm("root", { action: "linkCheck", max: 20 });
ok("link checker records results", r.json.checked >= 1 && r.json.results[gone.id]?.ok === false, JSON.stringify(r.json.results?.[gone.id]));
r = await bm("root", { action: "setLinkStatuses", statuses: { [gone.id]: "broken" } });
ok("mark checked links as broken", r.json.folders.find((f) => f.id === sci).links.find((l) => l.id === gone.id).status === "broken");
r = await adm("ivy", { action: "linkCheck" });
ok("only admins run the checker", r.status === 403);

/* ---------- two people editing at once ---------- */
r = await call("root", "/api/bookmarks");
const desmos = r.json.folders.find((f) => f.id === maths.id).links.find((l) => l.name === "Desmos");
const seen = desmos.updatedAt || "";
await bm("root", { action: "editLink", folderId: maths.id, linkId: desmos.id, name: "Desmos Graphing", expectUpdatedAt: seen });
r = await bm("root", { action: "editLink", folderId: maths.id, linkId: desmos.id, name: "Desmos Calc", expectUpdatedAt: seen });
ok("a stale edit is refused", r.status === 400 && /Someone else changed/.test(r.json.error), r.json.error);
r = await bm("root", { action: "editLink", folderId: maths.id, linkId: desmos.id, name: "Desmos Calc", force: true });
ok("…unless they choose to overwrite", r.json.folders.find((f) => f.id === maths.id).links.find((l) => l.id === desmos.id).name === "Desmos Calc");

/* ---------- public JSON, feeds, calendar, embeds ---------- */
await bm("root", { action: "editFolder", folderId: maths.id, perm: { view: "members" } });
let res = await fetch(`${BASE}/api/public`);
let j = await res.json();
ok("public JSON leaves out members-only folders and who added things", !j.folders.some((f) => f.id === maths.id) && j.folders.some((f) => f.id === sci) && !JSON.stringify(j).includes("addedBy"));
ok("…and other apps may read it", res.headers.get("access-control-allow-origin") === "*");
res = await fetch(`${BASE}/api/public?folder=${sci}`);
ok("one folder", (await res.json()).folders.length === 1);
res = await fetch(`${BASE}/api/feed`);
const rss = await res.text();
ok("RSS feed of new links", res.headers.get("content-type").includes("rss") && rss.includes("<item>") && rss.includes("PhET") && !rss.includes("Desmos"), rss.slice(0, 120));
res = await fetch(`${BASE}/api/feed?format=json`);
ok("JSON Feed", (await res.json()).items.some((i) => i.title === "PhET"));
await call("root", "/api/events", { title: "Science fair", date: new Date(Date.now() + 86400e3).toISOString(), description: "Bring posters, please" });
res = await fetch(`${BASE}/api/events?ics=1`);
const ics = await res.text();
ok("calendar file for events", res.headers.get("content-type").includes("text/calendar") && ics.includes("BEGIN:VEVENT") && ics.includes("SUMMARY:Science fair") && ics.includes("Bring posters\\, please"), ics.slice(0, 200));
res = await fetch(`${BASE}/embed/${sci}`);
ok("embed pages may be framed by other sites", (res.headers.get("content-security-policy") || "").includes("frame-ancestors *") && !res.headers.get("x-frame-options"));
res = await fetch(`${BASE}/`);
ok("…but nothing else can", (res.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'") && res.headers.get("x-frame-options") === "DENY");

/* ---------- bring your settings to another account ---------- */
await me("ivy", { action: "linkPref", linkId: desmos.id, patch: { note: "use for homework", later: true } });
await me("ivy", { action: "saveView", view: { name: "Maths only", q: "maths", tags: [] } });
await me("ivy", { action: "settings", settings: { look: { palette: "ocean" } } });
res = await fetch(`${BASE}/api/me?export=1`, { headers: { cookie: (await call("ivy", "/api/auth", { action: "login", username: "ivy", password: "secret1" })).headers.get("set-cookie").split(";")[0] } });
const file = await res.json();
r = await me("jay", { action: "importPersonal", file });
ok("import your own data file into an account", r.json.imported?.notes === 1 && r.json.links?.[desmos.id]?.note === "use for homework", JSON.stringify(r.json.imported));
ok("…views and look come too", r.json.views?.some((v) => v.name === "Maths only") && r.json.settings?.look?.palette === "ocean", JSON.stringify(r.json.settings));
r = await me("jay", { action: "importPersonal", file: { linkNotes: { "bad id!": { note: "x" } }, favorites: ["<script>"] } });
ok("…and junk in the file is ignored", r.json.imported.notes === 0 && !r.json.favorites.includes("<script>"));

done();
