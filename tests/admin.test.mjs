// Admin & moderation: timeouts, warnings, notes, freezing, groups, approval
// queue, sign-up controls, word filter, maintenance, folder permissions,
// scheduling, trash, find & replace, reports, staff board, mod permissions.
import { ADMIN_PW, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("boss", "modo", "amy", "bob", "cat", "dan");
await adm("boss", { action: "claimOwner", password: ADMIN_PW });
await adm("boss", { action: "setRole", username: "modo", role: "mod" });
const inbox = async (who) => (await me(who)).json.notifications || [];
const set = (settings) => bm("boss", { action: "setSettings", settings });

let r = await bm("boss", { action: "addFolder", name: "Games", emoji: "🎮" });
const fid = r.json.folders.find((f) => f.name === "Games").id;

/* ---------- timeouts, warnings, notes ---------- */
r = await adm("amy", { action: "timeout", username: "bob", hours: 2 });
ok("members can't time people out", r.status === 403);
r = await adm("modo", { action: "timeout", username: "bob", hours: 2, reason: "spam" });
ok("mod times someone out", !!r.json.timeouts?.bob);
r = await call("bob", "/api/chat", { text: "hello" });
ok("timed-out people can't chat", r.status === 403 && /timed out/.test(r.json.error), r.json.error);
r = await bm("bob", { action: "addLink", folderId: fid, name: "X", url: "x.example.com" });
ok("…or add links", r.status === 403, r.json.error);
ok("they're told why", (await inbox("bob")).some((n) => /timed out for 2 hours: spam/.test(n.text)));
r = await adm("modo", { action: "endTimeout", username: "bob" });
r = await call("bob", "/api/chat", { text: "back" });
ok("ending the timeout lets them back in", r.status === 200, r.json.error);
r = await adm("modo", { action: "warn", username: "cat", reason: "please be kind" });
ok("send a warning", r.json.ok === true && (await inbox("cat")).some((n) => /warning.*please be kind/i.test(n.text)));
r = await adm("modo", { action: "modNote", username: "cat", text: "Second warning this week" });
ok("private mod note", r.json.notes?.[0]?.text === "Second warning this week");
r = await adm("modo", { action: "userDetail", username: "cat" });
ok("user history shows the warning and note", r.json.history.some((h) => h.action === "warning") && r.json.notes.length === 1);
r = await call("cat", "/api/profile?user=cat");
ok("notes never reach the person", !JSON.stringify(r.json).includes("Second warning"));

/* ---------- freezing edits ---------- */
await bm("amy", { action: "addLink", folderId: fid, name: "Chess", url: "chess.example.com" });
r = await call("x", "/api/bookmarks");
const chess = r.json.folders.find((f) => f.id === fid).links[0];
await adm("modo", { action: "freeze", username: "amy" });
r = await bm("amy", { action: "addLink", folderId: fid, name: "Go", url: "go.example.com" });
ok("frozen people can't add", r.status === 400 && /paused your edits/.test(r.json.error), r.json.error);
r = await bm("amy", { action: "toggleLike", folderId: fid, linkId: chess.id });
ok("…but can still like things", r.status === 200);
await adm("modo", { action: "unfreeze", username: "amy" });

/* ---------- approval queue, contributors, new accounts ---------- */
await set({ approveLinks: true });
r = await bm("dan", { action: "addLink", folderId: fid, name: "Tetris", url: "tetris.example.com" });
ok("members' links wait for approval", r.status === 200 && /waiting for approval/.test(r.json.queued) && !r.json.folders.find((f) => f.id === fid).links.some((l) => l.name === "Tetris"), JSON.stringify(r.json.queued));
r = await adm("boss", { action: "overview" });
ok("…as a suggestion", r.json.suggestions.some((s) => s.kind === "addLink" && s.name === "Tetris" && s.status === "pending"));
await adm("boss", { action: "setGroup", group: "contributors", username: "dan" });
r = await bm("dan", { action: "addLink", folderId: fid, name: "Snake", url: "snake.example.com" });
ok("contributors skip the queue", !r.json.queued && r.json.folders.find((f) => f.id === fid).links.some((l) => l.name === "Snake"));
r = await bm("boss", { action: "addLink", folderId: fid, name: "Pong", url: "pong.example.com" });
ok("admins skip the queue", !r.json.queued);
await set({ approveLinks: false, newAccountWait: true });
r = await bm("cat", { action: "addLink", folderId: fid, name: "Sudoku", url: "sudoku.example.com" });
ok("brand-new accounts only suggest", /first day/.test(r.json.queued || ""), r.json.queued);
await set({ newAccountWait: false });

/* ---------- sign-ups ---------- */
await set({ signups: "closed" });
r = await call("newbie", "/api/auth", { action: "signup", username: "newbie", password: "secret1" });
ok("closed sign-ups", r.status === 400 && /closed/.test(r.json.error), r.json.error);
await set({ signups: "invite" });
r = await call("newbie", "/api/auth", { action: "signup", username: "newbie", password: "secret1" });
ok("invite needed", /invite code/.test(r.json.error || ""), r.json.error);
r = await adm("boss", { action: "createInvite", uses: 1, days: 7 });
const code = r.json.invites[0].code;
r = await call("newbie", "/api/auth", { action: "signup", username: "newbie", password: "secret1", invite: code.toLowerCase() });
ok("valid invite works", r.json.user === "newbie", JSON.stringify(r.json));
r = await call("newbie2", "/api/auth", { action: "signup", username: "newbie2", password: "secret1", invite: code });
ok("used-up invite fails", r.status === 400, r.json.error);
await set({ signups: "open", blockedNames: "teacher\nadmin" });
r = await call("t1", "/api/auth", { action: "signup", username: "the_teacher", password: "secret1" });
ok("blocked usernames", r.status === 400 && /isn't allowed/.test(r.json.error), r.json.error);
r = await call("t2", "/api/auth", { action: "signup", username: "sh1thead", password: "secret1" });
ok("rude usernames", r.status === 400, r.json.error);

/* ---------- word filter ---------- */
await set({ wordFilter: "potato" });
await new Promise((res) => setTimeout(res, 10500)); // flags are cached for 10s
r = await call("bob", "/api/chat", { text: "I like POTATO soup" });
const last = r.json.messages?.[r.json.messages.length - 1];
ok("word filter hides words in chat", last?.text === "I like ★★★★★★ soup", last?.text);

/* ---------- maintenance ---------- */
await set({ maintenance: true, maintenanceMessage: "back soon" });
await new Promise((res) => setTimeout(res, 10500));
r = await bm("amy", { action: "addLink", folderId: fid, name: "M", url: "m.example.com" });
ok("read-only for members", r.status === 503 && /back soon/.test(r.json.error), `${r.status} ${r.json.error}`);
r = await bm("boss", { action: "editFolder", folderId: fid, description: "Games for break time" });
ok("admins can still change things", r.status === 200);
await set({ maintenance: false });
await new Promise((res) => setTimeout(res, 10500));

/* ---------- folder permissions, scheduling ---------- */
await adm("boss", { action: "setGroup", group: "contributors", username: "dan", on: false });
r = await bm("boss", { action: "addFolder", name: "Staff picks", emoji: "⭐" });
const sp = r.json.folders.find((f) => f.name === "Staff picks").id;
await bm("boss", { action: "editFolder", folderId: sp, perm: { add: "admins", edit: "admins", view: "members" } });
r = await bm("amy", { action: "addLink", folderId: sp, name: "Y", url: "y.example.com" });
ok("locked folder refuses members", r.status === 403, r.json.error);
r = await call("guest", "/api/bookmarks");
ok("members-only folder hidden from guests", !r.json.folders.some((f) => f.id === sp));
r = await call("amy", "/api/bookmarks");
ok("…but members see it", r.json.folders.some((f) => f.id === sp));
const later = new Date(Date.now() + 3 * 86400e3).toISOString();
await bm("boss", { action: "addLink", folderId: fid, name: "Surprise", url: "surprise.example.com", showAt: later });
r = await call("amy", "/api/bookmarks");
ok("scheduled links hidden until their date", !r.json.folders.find((f) => f.id === fid).links.some((l) => l.name === "Surprise"));
r = await call("boss", "/api/bookmarks");
ok("…admins see them", r.json.folders.find((f) => f.id === fid).links.some((l) => l.name === "Surprise" && l.showAt));
r = await call("boss", "/api/bookmarks?asMember=1");
ok("view as member hides them for admins too", !r.json.folders.find((f) => f.id === fid).links.some((l) => l.name === "Surprise"));

/* ---------- trash, find & replace ---------- */
r = await call("boss", "/api/bookmarks");
const pong = r.json.folders.find((f) => f.id === fid).links.find((l) => l.name === "Pong");
await bm("boss", { action: "deleteLink", folderId: fid, linkId: pong.id });
r = await adm("boss", { action: "overview" });
const t = r.json.trash.find((x) => x.item.name === "Pong");
ok("deleted links go to the trash", !!t);
r = await bm("boss", { action: "restoreTrash", id: t.id });
ok("restore from the trash", r.json.folders.find((f) => f.id === fid).links.some((l) => l.name === "Pong"));
r = await bm("boss", { action: "replaceUrls", find: "example.com", replace: "example.org" });
ok("find & replace in addresses", r.json.folders.find((f) => f.id === fid).links.every((l) => !l.url.includes("example.com")));

/* ---------- reports, staff board, counts ---------- */
r = await call("cat", "/api/reports", { kind: "link", targetId: chess.id, targetName: "Chess", reason: "doesn't load" });
ok("report a link", r.json.ok === true);
r = await call("cat", "/api/reports", { kind: "link", targetId: chess.id, targetName: "Chess", reason: "still broken" });
ok("no double reports", r.status === 400);
r = await call("modo", "/api/admin");
ok("staff badge counts it", r.json.reports === 1 && r.json.count >= 1, JSON.stringify(r.json));
r = await call("amy", "/api/admin");
ok("members get no count", r.json.count === 0);
r = await adm("modo", { action: "overview" });
const rep = r.json.reports[0];
r = await adm("modo", { action: "resolveReport", id: rep.id });
ok("resolve a report", r.json.reports.length === 0);
r = await adm("modo", { action: "boardSave", text: "Check new links on Friday", kind: "todo" });
const item = r.json.board[0];
r = await adm("boss", { action: "boardSave", id: item.id, pinned: true, done: true });
ok("staff board: to-do pinned and done", r.json.board[0].pinned && r.json.board[0].done);
r = await adm("modo", { action: "boardDelete", id: item.id });
ok("remove from the board", r.json.board.length === 0);

/* ---------- moderator permissions ---------- */
await set({ modPerms: { warn: false } });
await new Promise((res) => setTimeout(res, 10500));
r = await adm("modo", { action: "warn", username: "cat", reason: "x" });
ok("owner can stop mods warning people", r.status === 403, r.json.error);
r = await adm("modo", { action: "timeout", username: "cat", hours: 1 });
ok("…other powers still work", r.status === 200);
await adm("modo", { action: "endTimeout", username: "cat" });

/* ---------- bulk, danger zone, stats, exports, switches ---------- */
r = await adm("modo", { action: "bulkUsers", usernames: ["amy", "bob", "boss"], op: "mute" });
ok("bulk mute skips staff", r.json.done === 2 && r.json.skipped === 1 && r.json.banned.includes("amy"));
await adm("modo", { action: "bulkUsers", usernames: ["amy", "bob"], op: "unmute" });
r = await adm("boss", { action: "bulkUsers", usernames: ["newbie"], op: "delete" });
ok("bulk delete needs typing DELETE", r.status === 400 && /DELETE/.test(r.json.error));
r = await bm("boss", { action: "reset" });
ok("reset needs typing RESET", r.status === 400 && /RESET/.test(r.json.error));
await call("guest", "/api/bookmarks", { action: "trackClick", linkId: chess.id });
r = await adm("boss", { action: "overview" });
const todayRow = r.json.stats[r.json.stats.length - 1];
ok("daily stats count visits, sign-ups and messages", todayRow.clicks >= 1 && todayRow.signups >= 7 && todayRow.messages >= 2, JSON.stringify(todayRow));
ok("database meter", r.json.db?.keys > 0 && r.json.db.approxBytes > 0);
r = await adm("modo", { action: "exportChat" });
ok("only admins export chat", r.status === 403);
r = await adm("boss", { action: "exportChat" });
ok("export chat", r.json.messages.length >= 2);
r = await adm("boss", { action: "forceLogout", username: "amy" });
r = await call("amy", "/api/auth");
ok("force log out", r.json.user === null, JSON.stringify(r.json));
await set({ pollsEnabled: false });
r = await bm("boss", { action: "createPoll", question: "Q?", options: ["a", "b"] });
r = await bm("bob", { action: "votePoll", pollId: r.json.polls[0].id, option: 0 });
ok("polls switch", r.status === 400 && /turned off/.test(r.json.error), r.json.error);
await set({ communityEnabled: false });
await new Promise((res) => setTimeout(res, 10500));
r = await call("bob", "/api/boards", { kind: "tips", title: "t", text: "x" });
ok("community switch", r.status === 400 && /switched off/.test(r.json.error), r.json.error);

/* ---------- username history ---------- */
r = await me("dan", { action: "rename", newName: "danny", password: "secret1" });
r = await adm("boss", { action: "overview" });
ok("admins see earlier names", r.json.names?.danny?.includes("dan"), JSON.stringify(r.json.names));

done();
