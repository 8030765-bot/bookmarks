// Channels, editing, commands, polls, pins, answered, slow mode, rules, keyword alerts, search, clubs.
import { ADMIN_PW, BASE, bm, call, done, ok, signup, sleep, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("ava", "bea", "cal", "modz");
const chat = (who, body) => call(who, "/api/chat", body);
const get = (who, q) => call(who, `/api/chat${q}`);
await call("own", "/api/auth", { action: "signup", username: "own", password: "secret1" });
await call("own", "/api/admin", { action: "claimOwner", password: ADMIN_PW });
await call("own", "/api/admin", { action: "setRole", username: "modz", role: "mod" });

// channels
let r = await get("anon", "?ch=general");
ok("built-in channels", ["general", "help", "random"].every((c) => r.json.channels?.some((x) => x.id === c)), JSON.stringify(r.json.channels?.map((c) => c.id)));
await chat("ava", { ch: "help", text: "How do I share a folder?" });
r = await get("anon", "?ch=help");
const q = r.json.messages.at(-1);
ok("messages go to their channel", q?.text === "How do I share a folder?" && q.channel === "help");
ok("…and not to others", !(await get("anon", "?ch=general")).json.messages.some((m) => m.id === q.id));

// edit / delete
await sleep(1100);
r = await chat("ava", { ch: "help", action: "edit", id: q.id, text: "How do I share a folder link?" });
ok("edit your own message", r.json.messages.find((m) => m.id === q.id)?.text === "How do I share a folder link?" && r.json.messages.find((m) => m.id === q.id).edited);
r = await chat("bea", { ch: "help", action: "edit", id: q.id, text: "hacked" });
ok("can't edit someone else's", r.status === 400, r.json.error);
r = await chat("bea", { ch: "help", action: "answer", id: q.id });
ok("only the asker (or a mod) marks it answered", r.status === 400);
r = await chat("ava", { ch: "help", action: "answer", id: q.id });
ok("asker marks it answered", r.json.messages.find((m) => m.id === q.id)?.answered === true);

// commands
await sleep(1100);
r = await chat("bea", { ch: "random", text: "/roll 2d6" });
let m = r.json.messages.at(-1);
ok("/roll", m.kind === "roll" && /rolled 2d6: \d+ \+ \d+ = \d+/.test(m.text), m.text);
await sleep(1100);
r = await chat("bea", { ch: "random", text: "/me waves" });
ok("/me", r.json.messages.at(-1).kind === "me" && r.json.messages.at(-1).text === "waves");
await sleep(1100);
r = await chat("bea", { ch: "random", text: "/poll Best snack? | Chips | Fruit | Cookies" });
const poll = r.json.messages.at(-1);
ok("/poll makes a poll", poll.kind === "poll" && poll.poll.options.length === 3);
await chat("ava", { ch: "random", action: "vote", id: poll.id, option: 1 });
r = await chat("cal", { ch: "random", action: "vote", id: poll.id, option: 1 });
ok("votes counted", r.json.messages.find((x) => x.id === poll.id).poll.votes["1"]?.length === 2);
r = await chat("cal", { ch: "random", action: "vote", id: poll.id, option: 1 });
ok("voting again takes it back", r.json.messages.find((x) => x.id === poll.id).poll.votes["1"]?.length === 1);
await sleep(1100);
r = await chat("bea", { ch: "random", text: "/announce hi all" });
ok("/announce is admin-only", r.status === 400, r.json.error);
r = await chat("bea", { ch: "random", text: "/dance" });
ok("unknown commands explained", r.status === 400 && /Unknown command/.test(r.json.error));
r = await chat("own", { ch: "general", text: "/announce Welcome back!" });
ok("admin announcement", r.json.messages.at(-1).kind === "announce");

// spam guard + pins + mod delete
await sleep(1100);
await chat("cal", { ch: "general", text: "same thing" });
await sleep(1100);
r = await chat("cal", { ch: "general", text: "Same thing" });
ok("repeating yourself is blocked", r.status === 400 && /just sent that/.test(r.json.error), r.json.error);
const target = (await get("anon", "?ch=general")).json.messages.find((x) => x.text === "same thing");
r = await chat("cal", { ch: "general", action: "pin", id: target.id });
ok("only mods pin", r.status === 403);
r = await chat("modz", { ch: "general", action: "pin", id: target.id });
ok("mod pins", r.json.pins?.[0]?.id === target.id);
r = await chat("ava", { ch: "general", action: "delete", id: target.id });
ok("can't delete someone else's", r.status === 403);
r = await chat("modz", { ch: "general", action: "delete", id: target.id });
ok("mod deletes", !r.json.messages.some((x) => x.id === target.id));
r = await chat("cal", { ch: "random", action: "delete", id: (await get("cal", "?ch=random")).json.messages.find((x) => x.user === "bea")?.id });
ok("can't delete others even in another channel", r.status === 403);

// channel settings: slow mode, rules; site chat rules
r = await chat("ava", { action: "saveChannel", channel: { id: "general", slow: 30 } });
ok("only admins change channels", r.status === 403);
r = await chat("own", { action: "saveChannel", channel: { id: "general", slow: 30, rules: "Be nice" } });
ok("slow mode + rules saved", r.json.channels.find((c) => c.id === "general")?.slow === 30);
await sleep(1100);
await chat("bea", { ch: "general", text: "one" });
await sleep(1100);
r = await chat("bea", { ch: "general", text: "two" });
ok("slow mode enforced", r.status === 400 && /Slow mode/.test(r.json.error), r.json.error);
await chat("own", { action: "saveChannel", channel: { id: "general", slow: 0 } });
await bm("own", { action: "setSettings", settings: { chatLinkAllow: ["khanacademy.org"], chatMaxLen: 60 } });
await sleep(1100);
r = await chat("ava", { ch: "random", text: "look https://www.youtube.com/watch?v=1" });
ok("links limited to allowed sites", r.status === 400 && /youtube\.com/.test(r.json.error), r.json.error);
await sleep(1100);
r = await chat("ava", { ch: "random", text: "ok https://www.khanacademy.org/math" });
ok("allowed sites fine", r.status === 200, r.json.error);
await sleep(1100);
r = await chat("ava", { ch: "random", text: "x".repeat(80) });
ok("admin message length limit", r.status === 400 && /60/.test(r.json.error));
await bm("own", { action: "setSettings", settings: { chatLinkAllow: [], chatMaxLen: 500 } });

// keyword alerts
r = await chat("cal", { action: "keywords", words: ["minecraft", "x", "Minecraft"] });
ok("keywords saved (cleaned)", JSON.stringify(r.json.keywords) === '["minecraft"]');
await sleep(1100);
await chat("bea", { ch: "random", text: "anyone play Minecraft?" });
r = await call("cal", "/api/me");
ok("keyword alert arrives", (r.json.notifications || []).some((n) => /minecraft/i.test(n.text) && n.link?.includes("ch=random")));

// typing + search + download
await chat("bea", { ch: "random", action: "typing" });
r = await get("ava", "?ch=random&typing=1");
ok("typing shows to others", r.json.typing?.includes("bea"));
ok("…not to yourself", !(await get("bea", "?ch=random&typing=1")).json.typing.includes("bea"));
r = await get("anon", `?q=${encodeURIComponent("share folder")}`);
ok("search finds across channels", r.json.results?.some((x) => x.channel === "help"));
const dl = await fetch(`${BASE}/api/chat?mine=1`, { headers: { cookie: (await call("ava", "/api/auth", { action: "login", username: "ava", password: "secret1" })).headers.get("set-cookie").split(";")[0] } });
ok("download my messages", /attachment/.test(dl.headers.get("content-disposition") || "") && (await dl.json()).every((x) => x.user === "ava"));

// clubs
r = await call("ava", "/api/clubs", { action: "create", name: "Coding Club", emoji: "💻", description: "We build things", open: false });
const club = r.json.club;
ok("club created", club?.members?.[0] === "ava" && club.folderId);
r = await call("x", "/api/bookmarks");
const cf = r.json.folders.find((f) => f.id === club.folderId);
ok("club gets a folder", cf?.clubId === club.id && cf.space === "Clubs");
r = await get("ava", `?ch=club-${club.id}`);
ok("members read the club channel", r.status === 200);
r = await get("bea", `?ch=club-${club.id}`);
ok("non-members can't", r.status === 400);
ok("club channel hidden from non-members' list", !(await get("bea", "?ch=general")).json.channels.some((c) => c.clubId));
r = await get("modz", `?ch=club-${club.id}`);
ok("moderators can read club channels", r.status === 200);
r = await call("bea", "/api/clubs", { action: "join", id: club.id });
ok("invite-only clubs can't be joined", r.status === 400);
r = await call("ava", "/api/clubs", { action: "add", id: club.id, username: "bea" });
ok("owner adds a member", r.json.club?.members.includes("bea"));
await bm("own", { action: "setSettings", settings: { lockAdding: true } });
r = await bm("bea", { action: "addLink", folderId: club.folderId, name: "Scratch", url: "scratch.mit.edu" });
ok("club members edit the club folder (even when adding is locked)", r.status === 200, r.json.error);
r = await bm("cal", { action: "addLink", folderId: club.folderId, name: "Nope", url: "nope.example.com" });
ok("…others can't", r.status === 403);
await bm("own", { action: "setSettings", settings: { lockAdding: false } });
r = await call("bea", "/api/clubs", { action: "leave", id: club.id });
ok("members can leave", !r.json.club.members.includes("bea"));
r = await call("bea", "/api/clubs", { action: "delete", id: club.id });
ok("only the owner deletes", r.status === 400);
r = await call("ava", "/api/clubs", { action: "delete", id: club.id });
ok("club deleted", r.json.ok);
r = await call("x", "/api/bookmarks");
ok("…its folder is archived, not lost", r.json.folders.find((f) => f.id === club.folderId)?.archived === true);
ok("…its channel is gone", !(await get("ava", "?ch=general")).json.channels.some((c) => c.id === `club-${club.id}`));

done();
