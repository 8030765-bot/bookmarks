// Sub-folders, maintainers, smart folders, merge/split/copy, tags, following, views.
import { ADMIN_PW, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("mia", "max", "fan");
const admin = (b) => bm("admin", { ...b, password: ADMIN_PW });
const byName = (j, name) => j.folders.find((f) => f.name === name);

// folder extras + sub-folders
let r = await admin({ action: "addFolder", name: "Science", emoji: "🔬", description: "Labs and sims", guide: "# Start\n- try PhET" });
const sci = byName(r.json, "Science");
ok("description + guide saved", sci.description === "Labs and sims" && sci.guide.startsWith("# Start"));
r = await bm("mia", { action: "addFolder", name: "Chemistry", parentId: sci.id, space: "School", rule: "tag:x", maintainers: ["mia"] });
const chem = byName(r.json, "Chemistry");
ok("members can make a sub-folder", chem?.parentId === sci.id, chem?.parentId);
ok("…but not set admin-only folder fields", !chem.space && !chem.rule && !chem.maintainers, JSON.stringify({ s: chem.space, r: chem.rule, m: chem.maintainers }));
r = await admin({ action: "addFolder", name: "Deep", parentId: chem.id });
ok("only one level of sub-folders", r.status === 400 && /one level/.test(r.json.error), r.json.error);
r = await admin({ action: "addFolder", name: "Physics" });
const phys = byName(r.json, "Physics");
r = await admin({ action: "editFolder", folderId: sci.id, parentId: phys.id });
ok("a folder with sub-folders can't go inside another", r.status === 400, r.json.error);
r = await bm("mia", { action: "editFolder", folderId: chem.id, parentId: "" });
ok("members can't move existing folders", r.status === 403, r.json.error);

// admin folder fields
r = await admin({ action: "editFolder", folderId: phys.id, space: "School", sort: "newest", archived: true, maintainers: ["Max", "bad name!", "max", "fan"] });
let f = byName(r.json, "Physics");
ok("space, sort, archive saved", f.space === "School" && f.sort === "newest" && f.archived === true);
ok("maintainers cleaned", JSON.stringify(f.maintainers) === '["max","fan"]', JSON.stringify(f.maintainers));
r = await admin({ action: "editFolder", folderId: phys.id, sort: "bogus", archived: false });
f = byName(r.json, "Physics");
ok("bad sort cleared, unarchive works", !f.sort && !f.archived);

// maintainers manage just their folder
await admin({ action: "setSettings", settings: { lockAdding: true } });
r = await bm("max", { action: "addLink", folderId: phys.id, name: "PhET", url: "phet.colorado.edu", tags: ["sim"] });
ok("maintainer adds even when adding is locked", r.status === 200, r.json.error);
const phet = byName(r.json, "Physics").links[0];
r = await bm("max", { action: "editLink", folderId: phys.id, linkId: phet.id, name: "PhET sims", pinned: true });
const edited = byName(r.json, "Physics").links[0];
ok("maintainer edits their folder's links", edited.name === "PhET sims");
ok("…but can't use admin-only extras", !edited.pinned);
r = await bm("max", { action: "editFolder", folderId: phys.id, description: "Forces and motion", space: "Hacked" });
f = byName(r.json, "Physics");
ok("maintainer edits description, not space", f.description === "Forces and motion" && f.space === "School", JSON.stringify({ d: f.description, s: f.space }));
r = await bm("max", { action: "addLink", folderId: sci.id, name: "Nope", url: "nope.example.com" });
ok("maintainer can't add elsewhere while locked", r.status === 403);
r = await bm("max", { action: "deleteFolder", folderId: phys.id });
ok("maintainer can't delete the folder", r.status === 403);
r = await bm("mia", { action: "editLink", folderId: phys.id, linkId: phet.id, name: "Mine now" });
ok("non-maintainers can't edit", r.status === 403);
await admin({ action: "setSettings", settings: { lockAdding: false } });

// smart folders
r = await admin({ action: "addFolder", name: "All sims", rule: "tag:sim" });
const smart = byName(r.json, "All sims");
ok("smart folder created", smart.rule === "tag:sim" && smart.links.length === 0);
r = await bm("mia", { action: "addLink", folderId: smart.id, name: "X", url: "x.example.com" });
ok("can't add links to a smart folder", r.status === 400, r.json.error);
r = await admin({ action: "moveLinkTo", folderId: phys.id, linkId: phet.id, targetFolderId: smart.id });
ok("can't move links into a smart folder", r.status === 400);
r = await admin({ action: "editFolder", folderId: phys.id, rule: "tag:x" });
ok("only empty folders can become smart", r.status === 400, r.json.error);

// tags
r = await bm("mia", { action: "addLink", folderId: sci.id, name: "Lab", url: "lab.example.com", tags: ["lab", "sim"] });
r = await admin({ action: "renameTag", from: "lab", to: "sim" });
let lab = byName(r.json, "Science").links.find((l) => l.name === "Lab");
ok("renaming onto an existing tag merges", JSON.stringify(lab.tags) === '["sim"]', JSON.stringify(lab.tags));
r = await admin({ action: "setTagColor", tag: "sim", color: "#3dd68c" });
ok("tag colour saved", r.json.settings?.tagColors?.sim === "#3dd68c");
r = await admin({ action: "setTagColor", tag: "sim", color: "javascript:x" });
ok("bad colour clears it", !r.json.settings?.tagColors?.sim);
r = await admin({ action: "deleteTag", tag: "sim" });
ok("tag removed everywhere", r.json.folders.every((x) => x.links.every((l) => !l.tags?.includes("sim"))));
r = await bm("mia", { action: "renameTag", from: "a", to: "b" });
ok("tag tools are admin-only", r.status === 403);

// split / duplicate / merge
r = await admin({ action: "addLinks", folderId: sci.id, links: [{ name: "A", url: "a.example.com" }, { name: "B", url: "b.example.com" }], tags: ["video"] });
r = await admin({ action: "splitFolder", folderId: sci.id, tag: "video" });
const videos = byName(r.json, "Video");
ok("split moves tagged links into a new folder", videos?.links.length === 2 && !byName(r.json, "Science").links.some((l) => l.tags?.includes("video")));
r = await admin({ action: "duplicateFolder", folderId: videos.id });
const copy = byName(r.json, "Video (copy)");
ok("duplicate copies links with new ids", copy?.links.length === 2 && copy.links[0].id !== videos.links[0].id);
r = await admin({ action: "mergeFolder", folderId: copy.id, intoId: videos.id });
ok("merge skips duplicates and removes the old folder", !byName(r.json, "Video (copy)") && byName(r.json, "Video").links.length === 2);
r = await admin({ action: "mergeFolder", folderId: videos.id, intoId: videos.id });
ok("can't merge a folder into itself", r.status === 400);

// deleting a parent keeps its sub-folders
r = await admin({ action: "deleteFolder", folderId: sci.id });
ok("sub-folders move up when the parent is deleted", byName(r.json, "Chemistry") && !byName(r.json, "Chemistry").parentId);

// activity remembers the folder and who did it (members can see who; guests can't)
r = await call("max", "/api/bookmarks");
const entry = r.json.activity.find((a) => a.detail.includes("PhET sims"));
ok("history records folder and person", entry?.folderId === phys.id && entry?.by === "max", JSON.stringify(entry));

// following a folder
r = await me("fan", { action: "folderPref", folderId: phys.id, patch: { follow: true, sort: "rating", fav: true } });
ok("folder prefs saved", r.json.folders?.[phys.id]?.follow && r.json.folders[phys.id].sort === "rating" && r.json.folders[phys.id].fav);
await bm("max", { action: "addLink", folderId: phys.id, name: "Forces", url: "forces.example.com" });
r = await call("fan", "/api/me");
ok("followers hear about new links", (r.json.notifications || []).some((n) => n.kind === "follow" && n.text.includes("Forces")), JSON.stringify(r.json.notifications?.[0]));
r = await call("max", "/api/me");
ok("the person who added it isn't notified", !(r.json.notifications || []).some((n) => n.kind === "follow"));
await me("fan", { action: "folderPref", folderId: phys.id, patch: { follow: false } });
await bm("max", { action: "addLink", folderId: phys.id, name: "Waves", url: "waves.example.com" });
r = await call("fan", "/api/me");
ok("unfollowing stops it", !(r.json.notifications || []).some((n) => n.text.includes("Waves")));
r = await me("fan", { action: "folderPref", folderId: phys.id, patch: { sort: "nonsense", fav: false } });
ok("bad sort ignored, cleared prefs removed", !r.json.folders[phys.id]);

// personal order + saved views
r = await me("fan", { action: "folderOrder", order: [phys.id, "bad id!", phys.id, chem.id] });
ok("folder order saved (cleaned)", JSON.stringify(r.json.folderOrder) === JSON.stringify([phys.id, chem.id]), JSON.stringify(r.json.folderOrder));
r = await me("fan", { action: "saveView", view: { name: "Sims", q: "is:new", tags: ["sim"], tagMode: "all" } });
ok("view saved", r.json.views?.[0]?.name === "Sims" && r.json.views[0].tagMode === "all");
r = await me("fan", { action: "saveView", view: { name: "  " } });
ok("views need a name", r.status === 400);
r = await me("fan", { action: "deleteView", id: (await call("fan", "/api/me")).json.views[0].id });
ok("view deleted", r.json.views.length === 0);

// start here
r = await admin({ action: "setSettings", settings: { startFolderId: phys.id } });
ok("start folder set", r.json.settings.startFolderId === phys.id);
r = await admin({ action: "setSettings", settings: { startFolderId: "nope" } });
ok("unknown start folder cleared", !r.json.settings.startFolderId);

// folder ratings use the normal rating system
await me("fan", { action: "rate", linkId: `f_${phys.id}`, stars: 4 });
r = await call("x", "/api/ratings");
ok("folders can be rated", r.json.ratings[`f_${phys.id}`]?.avg === 4);

done();
