// Notification settings, do-not-disturb, read/clear, follow alerts, push setup.
import { bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("nia", "omar", "pat");
const inbox = async (who) => (await call(who, "/api/me")).json.notifications || [];

let r = await bm("nia", { action: "addFolder", name: "News", emoji: "📰" });
const fid = r.json.folders.find((f) => f.name === "News").id;
r = await bm("nia", { action: "addLink", folderId: fid, name: "Story", url: "story.example.com" });
const link = r.json.folders.find((f) => f.id === fid).links[0];

// likes carry a link straight to the card
await bm("omar", { action: "toggleLike", folderId: fid, linkId: link.id });
let n = await inbox("nia");
ok("like notification links to the card", n[0]?.kind === "like" && n[0]?.link === `/#link-${link.id}`, JSON.stringify(n[0]));

// turning a kind off stops it arriving at all
r = await me("nia", { action: "notifyPrefs", prefs: { like: false, bogus: false } });
ok("per-type settings saved", r.json.notifyPrefs?.like === false && !("bogus" in r.json.notifyPrefs), JSON.stringify(r.json.notifyPrefs));
await bm("omar", { action: "toggleLike", folderId: fid, linkId: link.id });
await bm("omar", { action: "toggleLike", folderId: fid, linkId: link.id });
ok("switched-off kinds don't arrive", (await inbox("nia")).filter((x) => x.kind === "like").length === 1);

// read one / clear one / clear all
await call("pat", "/api/chat", { text: "hey @nia" });
n = await inbox("nia");
const mention = n.find((x) => x.kind === "mention");
ok("mention links to chat", mention?.link === "/?chat=open");
r = await me("nia", { action: "readNotifications", id: mention.id });
ok("mark one as read", r.json.notifications.find((x) => x.id === mention.id)?.read && r.json.notifications.some((x) => !x.read));
r = await me("nia", { action: "clearNotifications", id: mention.id });
ok("remove one", !r.json.notifications.some((x) => x.id === mention.id) && r.json.notifications.length >= 1);
r = await me("nia", { action: "clearNotifications" });
ok("clear all", r.json.notifications.length === 0);

// do not disturb
const later = new Date(Date.now() + 3600e3).toISOString();
r = await me("nia", { action: "dnd", until: later });
ok("do-not-disturb set", r.json.dndUntil === later);
r = await me("nia", { action: "dnd", until: new Date(Date.now() - 1000).toISOString() });
ok("a time in the past turns it off", r.json.dndUntil === null);

// following a person: hear about what they add
await me("pat", { action: "follow", username: "nia" });
await bm("nia", { action: "addLink", folderId: fid, name: "Second story", url: "story2.example.com" });
n = await inbox("pat");
ok("followers of a person hear about new links", n.some((x) => x.kind === "follow" && /nia added “Second story”/.test(x.text) && x.link?.startsWith("/#link-")), JSON.stringify(n.map((x) => x.text)));
// following both the folder and the person: told once, not twice
await me("pat", { action: "folderPref", folderId: fid, patch: { follow: true } });
await bm("nia", { action: "addLink", folderId: fid, name: "Third story", url: "story3.example.com" });
n = await inbox("pat");
ok("no double alerts when you follow both", n.filter((x) => x.text.includes("Third story")).length === 1);

// push isn't configured in tests
r = await call("nia", "/api/me");
ok("page learns push isn't set up", r.json.pushKey === null && r.json.push === false);
r = await me("nia", { action: "pushSubscribe", subscription: { endpoint: "https://push.example.com/x", keys: { p256dh: "a", auth: "b" } } });
ok("subscribing without push keys says so", r.status === 400 && /aren't set up/.test(r.json.error), r.json.error);

done();
