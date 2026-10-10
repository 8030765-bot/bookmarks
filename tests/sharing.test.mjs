// Sharing: folder links with a preview card, shared My Stuff folders
// (members only, reportable, admins can take them down), sending a
// website to someone you follow, and admins previewing as a guest.
import { ADMIN_PW, BASE, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("owner1", "kai", "ben", "zed");
await adm("owner1", { action: "claimOwner", password: ADMIN_PW });

let r = await bm("owner1", { action: "addFolder", name: "Maths", emoji: "📐" });
const maths = r.json.folders.find((f) => f.name === "Maths").id;
r = await bm("owner1", { action: "addLink", folderId: maths, name: "Desmos", url: "desmos.example.com" });
const desmos = r.json.folders.find((f) => f.id === maths).links[0];

/* ---------- /f/<folder> preview page ---------- */
let res = await fetch(`${BASE}/f/${maths}`);
let html = await res.text();
ok("folder link page loads", res.status === 200);
ok("…with a preview title", /<meta property="og:title" content="📐 Maths"/.test(html), html.match(/og:title[^>]*>/)?.[0]);
ok("…and what's in it", /1 website: Desmos/.test(html));
await bm("owner1", { action: "editFolder", folderId: maths, perm: { view: "members" } });
html = await (await fetch(`${BASE}/f/${maths}`)).text();
ok("members-only folders don't leak into previews", !/Desmos/.test(html) && /isn.t available/.test(html));
await bm("owner1", { action: "editFolder", folderId: maths, perm: { view: "everyone" } });

/* ---------- shared My Stuff folders ---------- */
await me("kai", { action: "addMyStuff", name: "Revision", url: "revise.example.com", folder: "Science" });
r = await me("kai", { action: "publishList", list: "" });
ok("only named folders can be shared", r.status === 400);
r = await me("kai", { action: "publishList", list: "Nope" });
ok("…that have something in them", r.status === 400);
r = await me("kai", { action: "publishList", list: "Science" });
ok("share a My Stuff folder", JSON.stringify(r.json.publicLists) === '["Science"]', JSON.stringify(r.json));
r = await call("ben", "/api/lists?user=kai&list=Science");
ok("members can see it", r.json.links?.[0]?.name === "Revision" && r.json.mine === false);
r = await call("guest", "/api/lists?user=kai&list=Science");
ok("guests can't", r.status === 401);
r = await call("ben", "/api/lists?user=kai&list=Secret");
ok("unshared folders stay private", r.status === 404);
r = await call("ben", "/api/profile?user=kai");
ok("shared lists show on the profile", JSON.stringify(r.json.lists) === '["Science"]');
r = await call("guest", "/api/profile?user=kai");
ok("…but not to guests", r.json.lists === undefined);
await me("kai", { action: "renameMyStuffFolder", from: "Science", to: "Biology" });
r = await me("kai");
ok("renaming keeps it shared", JSON.stringify(r.json.publicLists) === '["Biology"]', JSON.stringify(r.json.publicLists));
r = await call("ben", "/api/reports", { kind: "user", targetId: "kai", targetName: "kai's list", reason: "spam", extra: "list:Biology" });
ok("report a list", r.json.ok === true);
await adm("owner1", { action: "unpublishList", username: "kai", list: "Biology", reason: "spam" });
r = await call("ben", "/api/lists?user=kai&list=Biology");
ok("moderators can stop sharing it", r.status === 404);
r = await me("kai");
ok("…the owner is told, and keeps the links", r.json.notifications.some((n) => /stopped sharing your list/.test(n.text)) && r.json.myStuff.length === 1);

/* ---------- send a website to a friend ---------- */
r = await me("ben", { action: "sendLink", to: "kai", linkId: desmos.id });
ok("only to people you follow", r.status === 400 && /follow/.test(r.json.error));
await me("ben", { action: "follow", username: "kai", on: true });
r = await me("ben", { action: "sendLink", to: "kai", linkId: desmos.id });
ok("send it", r.json.ok === true);
r = await me("kai");
const sent = r.json.notifications.find((n) => n.kind === "share");
ok("they get a notification pointing at it", sent && /ben thinks you'd like “Desmos”/.test(sent.text) && sent.link === `/#link-${desmos.id}`);
r = await me("ben", { action: "sendLink", to: "kai", linkId: "nope" });
ok("only websites on the site", r.status === 400);
await me("kai", { action: "block", username: "zed", on: true });
await me("zed", { action: "follow", username: "kai", on: true });
const before = (await me("kai")).json.notifications.length;
r = await me("zed", { action: "sendLink", to: "kai", linkId: desmos.id });
ok("someone who blocked you never hears from you", r.json.ok === true && (await me("kai")).json.notifications.length === before);
r = await me("kai", { action: "notifyPrefs", prefs: { share: false } });
ok("you can turn these off", r.json.notifyPrefs?.share === false);

/* ---------- preview as a guest ---------- */
r = await call("owner1", "/api/bookmarks?as=guest");
const g = r.json.folders.find((f) => f.id === maths).links[0];
ok("admins can see the site as a guest does", g.addedBy === undefined);
r = await call("owner1", "/api/bookmarks?as=member");
ok("…or as a member", r.json.folders.find((f) => f.id === maths).links[0].addedBy === "owner1");

/* ---------- admin queue breakdown ---------- */
r = await call("owner1", "/api/admin");
ok("the admin badge says what's waiting", typeof r.json.reports === "number" && typeof r.json.pictures === "number" && typeof r.json.suggestions === "number");

done();
