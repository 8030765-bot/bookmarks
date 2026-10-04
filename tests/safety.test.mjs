// Safety & help: guests don't see names, feedback and replies, page faces,
// session time left + stay logged in, rules acceptance, help pages.
import { ADMIN_PW, BASE, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("owner1", "kai");
await adm("owner1", { action: "claimOwner", password: ADMIN_PW });

/* ---------- guests don't see who added or liked things ---------- */
let r = await bm("owner1", { action: "addFolder", name: "Art", emoji: "🎨" });
const art = r.json.folders.find((f) => f.name === "Art").id;
r = await bm("kai", { action: "addLink", folderId: art, name: "Sketchfab", url: "sketchfab.example.com" });
const link = r.json.folders.find((f) => f.id === art).links[0];
await bm("owner1", { action: "toggleLike", folderId: art, linkId: link.id });
r = await call("guest", "/api/bookmarks");
const g = r.json.folders.find((f) => f.id === art).links[0];
ok("guests don't see who added a link", g.addedBy === undefined, JSON.stringify(g));
ok("…or who liked it (but the count stays)", g.likes.length === 1 && !g.likes.includes("owner1"));
ok("…or who did what in the history", (r.json.activity || []).every((a) => !a.by));
r = await call("kai", "/api/bookmarks");
ok("members still see names", r.json.folders.find((f) => f.id === art).links[0].addedBy === "kai");

/* ---------- report a bug, message an admin ---------- */
r = await call("guest", "/api/feedback", { kind: "bug", text: "The add button does nothing", page: "/" });
ok("anyone can report a bug", r.json.ok === true);
r = await call("guest", "/api/feedback", { kind: "contact", text: "Hello admins" });
ok("messaging an admin needs an account", r.status === 401, r.json.error);
r = await call("kai", "/api/feedback", { kind: "contact", text: "Could we have a music folder?" });
ok("members can message the admins", r.json.ok === true);
r = await call("kai", "/api/feedback", { kind: "contact", text: "hi" });
ok("very short messages are refused", r.status === 400);
r = await call("owner1", "/api/admin");
ok("admin badge counts new messages", r.json.messages === 2, JSON.stringify(r.json));
r = await adm("owner1", { action: "overview" });
const msg = r.json.feedback.find((f) => f.kind === "contact");
ok("admins see bug reports and messages", r.json.feedback.length === 2 && msg.user === "kai");
r = await adm("owner1", { action: "replyFeedback", id: msg.id, text: "Good idea — added!" });
ok("reply to a message", r.json.feedback.find((f) => f.id === msg.id).reply?.text === "Good idea — added!");
r = await me("kai");
ok("…and they get a notification", r.json.notifications.some((n) => /replied.*Good idea/.test(n.text)));
r = await adm("owner1", { action: "deleteFeedback", id: msg.id });
ok("clear a message", r.json.feedback.length === 1);

/* ---------- 😀 😐 🙁 ---------- */
await call("guest", "/api/feedback", { kind: "rating", page: "/help", value: "good" });
await call("kai", "/api/feedback", { kind: "rating", page: "/help", value: "bad" });
r = await call("guest", "/api/feedback", { kind: "rating", page: "/help", value: "meh" });
ok("only the three faces", r.status === 400);
r = await adm("owner1", { action: "overview" });
ok("page faces are counted", r.json.pageRatings?.["/help"]?.good === 1 && r.json.pageRatings["/help"].bad === 1, JSON.stringify(r.json.pageRatings));

/* ---------- logged-out warning and staying logged in ---------- */
r = await call("kai", "/api/auth");
ok("the page knows how long the login lasts", typeof r.json.sessionLeft === "number" && r.json.sessionLeft > 86400 && r.json.rememberMe === true, JSON.stringify(r.json));
r = await call("kai", "/api/auth", { action: "extend" });
ok("stay logged in", r.json.sessionLeft >= 29 * 86400);
r = await call("guest", "/api/auth", { action: "extend" });
ok("…only when logged in", r.status === 401);

/* ---------- rules ---------- */
r = await call("newkid", "/api/auth", { action: "signup", username: "newkid", password: "secret1", acceptRules: true });
r = await me("newkid");
ok("agreeing to the rules at sign-up is recorded", !!r.json.rulesAcceptedAt);
r = await bm("owner1", { action: "setSettings", settings: { rules: "# Our rules\n1. Be kind" } });
ok("admins can write the rules", r.json.settings.rules.startsWith("# Our rules"));
for (const page of ["/help", "/rules", "/privacy", "/changelog"]) {
  const res = await fetch(`${BASE}${page}`);
  ok(`${page} page loads`, res.status === 200);
}

done();
