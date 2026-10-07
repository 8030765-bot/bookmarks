// Adding & editing: undo a delete (back in the same spot, only for people
// who could delete it), custom link icons, tracking bits removed, putting
// notifications back after clearing them.
import { ADMIN_PW, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("owner1", "kai", "ben", "zed");
await adm("owner1", { action: "claimOwner", password: ADMIN_PW });

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let r = await bm("owner1", { action: "addFolder", name: "Maths", emoji: "📐" });
const maths = r.json.folders.find((f) => f.name === "Maths").id;
for (const n of ["One", "Two", "Three"]) await bm("owner1", { action: "addLink", folderId: maths, name: n, url: `${n.toLowerCase()}.example.com` });
r = await call("owner1", "/api/bookmarks");
const two = r.json.folders.find((f) => f.id === maths).links.find((l) => l.name === "Two");
const oneLink = r.json.folders.find((f) => f.id === maths).links.find((l) => l.name === "One");
const one = () => oneLink;

/* ---------- undo a delete ---------- */
await bm("owner1", { action: "deleteLink", folderId: maths, linkId: two.id });
r = await bm("kai", { action: "restoreLink", linkId: two.id });
ok("members who couldn't delete it can't put it back", r.status >= 400, r.json.error);
r = await bm("owner1", { action: "restoreLink", linkId: two.id });
const names = r.json.folders?.find((f) => f.id === maths).links.map((l) => l.name);
ok("undo puts it back where it was", JSON.stringify(names) === JSON.stringify(["One", "Two", "Three"]), JSON.stringify(names || r.json));
r = await bm("owner1", { action: "restoreLink", linkId: two.id });
ok("…only once", r.status === 400);
r = await adm("owner1", { action: "overview" });
ok("…and it's out of the trash", !(r.json.trash || []).some((t) => t.item?.id === two.id));

// a folder maintainer can delete and undo in their folder
await bm("owner1", { action: "editFolder", folderId: maths, maintainers: ["kai"] });
await bm("kai", { action: "deleteLink", folderId: maths, linkId: two.id });
r = await bm("kai", { action: "restoreLink", linkId: two.id });
ok("maintainers can undo their deletes", r.json.folders?.find((f) => f.id === maths).links.some((l) => l.id === two.id), r.json.error);

// your own link, just added: you can take it back (Ctrl+Z) even without edit rights
r = await bm("ben", { action: "addLink", folderId: maths, name: "Oops", url: "oops.example.com" });
const oops = r.json.folders.find((f) => f.id === maths).links.find((l) => l.name === "Oops");
r = await bm("zed", { action: "deleteLink", folderId: maths, linkId: oops.id });
ok("…but not someone else's", r.status >= 400 || r.json.folders.find((f) => f.id === maths).links.some((l) => l.id === oops.id));
r = await bm("ben", { action: "deleteLink", folderId: maths, linkId: oops.id });
ok("take back a link you just added", !r.json.folders?.find((f) => f.id === maths).links.some((l) => l.id === oops.id), r.json.error);
r = await bm("ben", { action: "restoreLink", linkId: oops.id });
ok("…and redo it", r.json.folders?.find((f) => f.id === maths).links.some((l) => l.id === oops.id), r.json.error);
r = await bm("ben", { action: "deleteLink", folderId: maths, linkId: one().id });
ok("members still can't delete other links", r.status >= 400);

/* ---------- custom icons ---------- */
r = await me("kai", { action: "uploadImage", kind: "icon", data: PNG });
const kaiIcon = r.json.id;
ok("upload an icon (waits for a check)", !!kaiIcon && r.json.pending === true, JSON.stringify(r.json));
r = await me("kai", { action: "uploadImage", kind: "banner", data: PNG });
ok("only icons this way", r.status === 400);
r = await bm("kai", { action: "editLink", folderId: maths, linkId: two.id, iconImg: kaiIcon });
ok("set it on a link", r.json.folders?.find((f) => f.id === maths).links.find((l) => l.id === two.id).iconImg === kaiIcon, r.json.error);
r = await me("ben", { action: "uploadImage", kind: "icon", data: PNG });
const benIcon = r.json.id;
r = await bm("kai", { action: "editLink", folderId: maths, linkId: two.id, iconImg: benIcon });
ok("can't use someone else's icon", r.status === 400 && /uploaded/.test(r.json.error), r.json.error);
r = await bm("kai", { action: "editLink", folderId: maths, linkId: two.id, iconImg: "0".repeat(32) });
ok("…or one that doesn't exist", r.status === 400);
r = await adm("owner1", { action: "overview" });
ok("icons show up in the pictures queue", r.json.pictures.some((p) => p.id === kaiIcon && p.kind === "icon"));
await adm("owner1", { action: "reviewPicture", id: kaiIcon, ok: true });
ok("approved icons are public", (await call("guest", `/api/img/${kaiIcon}`)).status === 200);
r = await bm("kai", { action: "editLink", folderId: maths, linkId: two.id, iconImg: "" });
ok("go back to the site's own icon", r.json.folders.find((f) => f.id === maths).links.find((l) => l.id === two.id).iconImg === undefined);

/* ---------- tracking bits ---------- */
r = await bm("owner1", { action: "addLink", folderId: maths, name: "Tracked", url: "https://news.example.com/a?id=5&utm_source=x&fbclid=abc" });
const tracked = r.json.folders.find((f) => f.id === maths).links.find((l) => l.name === "Tracked");
ok("tracking bits are removed", tracked.url === "https://news.example.com/a?id=5", tracked.url);

/* ---------- notifications come back after clearing ---------- */
await me("kai", { action: "follow", username: "ben", on: true });
await me("owner1", { action: "follow", username: "ben", on: true });
r = await me("ben");
const before = r.json.notifications;
ok("ben has notifications", before.length === 2);
await me("ben", { action: "clearNotifications" });
r = await me("ben", { action: "restoreNotifications", notifications: before });
ok("undo clearing puts them back", r.json.notifications.length === 2 && r.json.notifications[0].id === before[0].id);
r = await me("ben", { action: "restoreNotifications", notifications: before });
ok("…without doubling up", r.json.notifications.length === 2);
r = await me("ben", { action: "restoreNotifications", notifications: [{ id: "fake1", kind: "hacker", text: "x", at: new Date().toISOString() }] });
ok("made-up kinds are ignored", r.json.notifications.length === 2);

done();
