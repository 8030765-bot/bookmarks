// Profiles & pictures: uploads wait for a moderator, approve/reject/remove,
// who can see waiting pictures, GIFs, banners, reports, faces, name checks,
// away/busy, badges, birthday, who sees when you're online.
import { ADMIN_PW, BASE, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("owner1", "kai", "ben", "zed");
await adm("owner1", { action: "claimOwner", password: ADMIN_PW });

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
// fetch an image as someone (call() keeps their cookies but expects JSON, so look at the status only)
const imgAs = async (who, id) => (await call(who, `/api/img/${id}`)).status;

/* ---------- checks on the file ---------- */
let r = await me("kai", { action: "uploadPicture", kind: "avatar", data: "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64") });
ok("a file that isn't really a picture is refused", r.status === 400, r.json.error);
r = await me("kai", { action: "uploadPicture", kind: "avatar", data: "data:image/svg+xml;base64,PHN2Zz4=" });
ok("SVG is refused", r.status === 400);
r = await me("kai", { action: "uploadPicture", kind: "avatar", data: "data:image/png;base64," + Buffer.concat([Buffer.from(PNG.split(",")[1], "base64"), Buffer.alloc(90_000)]).toString("base64") });
ok("too-big pictures are refused", r.status === 400 && /too big/.test(r.json.error), r.json.error);
r = await call("guest", "/api/me", { action: "uploadPicture", kind: "avatar", data: PNG });
ok("guests can't upload", r.status === 401);

/* ---------- upload → waits for a moderator ---------- */
r = await me("kai", { action: "uploadPicture", kind: "avatar", data: PNG });
const kaiPic = r.json.profile?.picPending;
ok("a member's picture waits for a moderator", r.json.pending === true && !!kaiPic && !r.json.profile.pic, JSON.stringify(r.json));
ok("…they can see it themselves", (await imgAs("kai", kaiPic)) === 200);
ok("…others can't yet", (await imgAs("ben", kaiPic)) === 404 && (await imgAs("guest", kaiPic)) === 404);
ok("…moderators can", (await imgAs("owner1", kaiPic)) === 200);
r = await call("guest", `/api/profile?user=kai`);
ok("waiting pictures aren't on the public profile", !r.json.profile.picPending && !r.json.profile.pic);
r = await call("owner1", "/api/admin");
ok("the admin badge counts waiting pictures", r.json.pictures === 1, JSON.stringify(r.json));
r = await adm("owner1", { action: "overview" });
ok("the queue lists it", r.json.pictures?.length === 1 && r.json.pictures[0].owner === "kai" && r.json.pictures[0].id === kaiPic);

// a newer upload replaces the waiting one
r = await me("kai", { action: "uploadPicture", kind: "avatar", data: PNG });
const kaiPic2 = r.json.profile.picPending;
ok("uploading again replaces the waiting picture", kaiPic2 !== kaiPic && (await imgAs("kai", kaiPic)) === 404);
r = await adm("owner1", { action: "overview" });
ok("…and the queue only has the new one", r.json.pictures.length === 1 && r.json.pictures[0].id === kaiPic2);

r = await call("ben", "/api/sync");
const facesBefore = r.json.faces;
r = await adm("kai", { action: "reviewPicture", id: kaiPic2, ok: true });
ok("members can't approve pictures", r.status >= 400);
r = await adm("owner1", { action: "reviewPicture", id: kaiPic2, ok: true });
ok("approve", Array.isArray(r.json.pictures) && r.json.pictures.length === 0, JSON.stringify(r.json));
r = await me("kai");
ok("the profile now uses it", r.json.profile.pic === kaiPic2 && !r.json.profile.picPending);
ok("…and they're told", r.json.notifications.some((n) => /approved/.test(n.text)));
const res = await fetch(`${BASE}/api/img/${kaiPic2}`);
ok("approved pictures are public and cached", res.status === 200 && /immutable/.test(res.headers.get("cache-control") || "") && res.headers.get("content-type") === "image/png");
ok("…and can't be run as a page", res.headers.get("x-content-type-options") === "nosniff");
r = await call("guest", "/api/faces");
ok("faces show the picture to everyone", r.json.faces?.kai?.p === kaiPic2, JSON.stringify(r.json.faces));
r = await call("ben", "/api/sync");
ok("…and the faces counter moved so pages refresh", r.json.faces > facesBefore);
r = await adm("owner1", { action: "reviewPicture", id: kaiPic2, ok: true });
ok("can't review the same picture twice", r.status === 400);

/* ---------- reject ---------- */
r = await me("ben", { action: "uploadPicture", kind: "avatar", data: PNG });
const benPic = r.json.profile.picPending;
r = await adm("owner1", { action: "reviewPicture", id: benPic, ok: false, reason: "Please use a picture without text" });
r = await me("ben");
ok("reject: picture gone and profile cleared", !r.json.profile.picPending && !r.json.profile.pic && (await imgAs("ben", benPic)) === 404);
ok("…with the reason in a notification", r.json.notifications.some((n) => /wasn't approved: Please use a picture without text/.test(n.text)));

/* ---------- staff don't wait; GIFs; banners ---------- */
r = await me("owner1", { action: "uploadPicture", kind: "avatar", data: GIF, still: PNG });
ok("staff pictures are used straight away", r.json.pending === false && !!r.json.profile.pic && !!r.json.profile.picGif, JSON.stringify(r.json));
const ownerGif = r.json.profile.picGif;
r = await call("guest", "/api/faces");
ok("guests get the still frame only", !!r.json.faces.owner1.p && !r.json.faces.owner1.g);
r = await call("ben", "/api/faces");
ok("members get the moving one too", r.json.faces.owner1.g === ownerGif);
r = await me("owner1", { action: "uploadPicture", kind: "banner", data: GIF, still: PNG });
ok("banners can't be GIFs", r.status === 400);
r = await me("owner1", { action: "uploadPicture", kind: "banner", data: PNG });
ok("upload a banner", !!r.json.profile.bannerPic);
r = await me("owner1", { action: "removePicture", kind: "avatar" });
ok("go back to the emoji", !r.json.profile.pic && !r.json.profile.picGif && (await imgAs("owner1", ownerGif)) === 404);

/* ---------- report a picture ---------- */
r = await call("ben", "/api/reports", { kind: "picture", targetId: "kai", targetName: "kai's picture", reason: "Not appropriate", extra: kaiPic2 });
ok("report someone's picture", r.json.ok === true, JSON.stringify(r.json));
r = await adm("owner1", { action: "overview" });
const rep = r.json.reports.find((x) => x.kind === "picture");
ok("…moderators see it", rep?.targetId === "kai");
r = await adm("owner1", { action: "removePicture", username: "kai", reason: "Not appropriate" });
r = await me("kai");
ok("moderators can remove it", !r.json.profile.pic && r.json.notifications.some((n) => /removed your profile picture/.test(n.text)));

/* ---------- is this username free? ---------- */
r = await call("guest", "/api/auth?check=kai");
ok("taken names say so", r.json.available === false && /taken/.test(r.json.reason));
r = await call("guest", "/api/auth?check=KAI");
ok("…whatever the capitals", r.json.available === false);
r = await call("guest", "/api/auth?check=newperson");
ok("free names say so", r.json.available === true);
r = await call("guest", "/api/auth?check=no spaces");
ok("bad names explain why", r.json.available === false && /letters/.test(r.json.reason));
r = await call("guest", "/api/auth?check=shithead");
ok("rude names are refused", r.json.available === false);

/* ---------- away / busy, birthday, colour ---------- */
r = await me("ben", { action: "profile", profile: { availability: "busy", birthday: "02-30", color: "#123abc" } });
ok("set busy", r.json.profile.availability === "busy");
ok("any colour", r.json.profile.color === "#123abc");
ok("birthdays are MM-DD", r.json.profile.birthday === "02-30");
r = await me("ben", { action: "profile", profile: { birthday: "13-01" } });
ok("…not nonsense", r.json.profile.birthday === undefined);
r = await me("ben", { action: "profile", profile: { availability: "sleepy" } });
ok("only away or busy", r.json.profile.availability === undefined);
await me("ben", { action: "profile", profile: { availability: "busy" } });
r = await call("guest", "/api/faces");
ok("faces show busy", r.json.faces.ben?.v === "busy");

/* ---------- badges ---------- */
r = await bm("owner1", { action: "addFolder", name: "Maths", emoji: "📐" });
const maths = r.json.folders.find((f) => f.name === "Maths").id;
await bm("zed", { action: "addLink", folderId: maths, name: "Desmos", url: "desmos.example.com" });
r = await call("ben", "/api/profile?user=zed");
ok("first link earns a badge", r.json.badges?.includes("first-link"), JSON.stringify(r.json.badges));
ok("early accounts get one", r.json.badges?.includes("early"));
r = await call("ben", "/api/profile?user=owner1");
ok("staff get the team badge", r.json.badges?.includes("staff"));
await me("zed", { action: "profile", profile: { badges: ["first-link", "curator", "early", "staff"] } });
r = await me("zed");
ok("pin up to 3", r.json.profile.badges.length === 3);
r = await call("ben", "/api/profile?user=zed");
ok("others only see pinned badges you've earned", JSON.stringify(r.json.profile.badges) === JSON.stringify(["first-link", "early"]), JSON.stringify(r.json.profile.badges));

/* ---------- who sees when you're online ---------- */
await me("zed", { action: "profile", profile: { lastSeenTo: "friends" } });
await me("zed", { action: "follow", username: "kai", on: true });
await call("zed", "/api/presence", { id: "tabzed" });
r = await call("kai", "/api/presence", { id: "tabkai" });
ok("people zed follows see zed online", r.json.users.includes("zed"), JSON.stringify(r.json.users));
r = await call("ben", "/api/presence", { id: "tabben" });
ok("others don't", !r.json.users.includes("zed"));
r = await call("ben", "/api/profile?user=zed");
ok("…or when zed was last here", r.json.lastSeen === undefined);
r = await call("kai", "/api/profile?user=zed");
ok("…but kai does", typeof r.json.lastSeen === "number");
r = await call("ben", "/api/people");
ok("the people page follows the same rule", r.json.people.find((p) => p.username === "zed").lastSeen === undefined);
await me("zed", { action: "profile", profile: { lastSeenTo: "" } });
r = await call("ben", "/api/profile?user=zed");
ok("switch back to everyone", typeof r.json.lastSeen === "number");

/* ---------- deleting an account removes its pictures ---------- */
r = await me("zed", { action: "uploadPicture", kind: "avatar", data: PNG });
const zedPic = r.json.profile.picPending;
await me("zed", { action: "deleteAccount", password: "secret1" });
ok("deleted accounts take their pictures with them", (await imgAs("owner1", zedPic)) === 404);

done();
