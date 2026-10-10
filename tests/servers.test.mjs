// Chat servers (Discord style): making one, its channels, joining
// (public and by invite), who can see what, server moderators, kicking
// and banning, staff oversight, notifications and turning servers off.
import { ADMIN_PW, adm, bm, call, done, ok, signup, sleep, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("sowner", "sam", "lia", "zed", "moe");
await adm("sowner", { action: "claimOwner", password: ADMIN_PW });

const sv = (who, body) => call(who, "/api/servers", body);
const chat = (who, body) => call(who, "/api/chat", body);

/* ---------- making a server ---------- */
let r = await sv("sam", { action: "create", server: { name: "Study Squad", icon: "📚", color: "#3ba55d", description: "Revision", public: true } });
const study = r.json.servers?.find((s) => s.id === r.json.created);
ok("make a server", !!study && study.owner === "sam" && study.members.includes("sam") && study.icon === "📚", r.json.error);
ok("it starts with #general", study?.channels.length === 1 && /^s-[a-z0-9]+-general$/.test(study.channels[0]));
const gen = study.channels[0];
ok("a server needs a name", (await sv("sam", { action: "create", server: { name: "x" } })).status === 400);

r = await sv("sam", { action: "create", server: { name: "Secret Club", public: false } });
const secret = r.json.servers?.find((s) => s.id === r.json.created);
ok("make an invite-only server", !!secret && secret.public === false && !!secret.invite);

/* ---------- seeing and joining ---------- */
r = await sv("lia", undefined);
ok("public servers show in Explore", r.json.explore.some((s) => s.id === study.id));
ok("…invite-only ones don't", !r.json.explore.some((s) => s.id === secret.id));
ok("…and outsiders don't get members or the invite", r.json.explore.every((s) => !s.members && !s.invite));
ok("outsiders can't read a server's channel", (await call("lia", `/api/chat?ch=${gen}`)).status >= 400);
ok("…or post in it", (await chat("lia", { ch: gen, text: "hi" })).status >= 400);
ok("…or join an invite-only server by its id", (await sv("lia", { action: "join", id: secret.id })).status === 400);

r = await sv("lia", { action: "join", id: study.id });
ok("join a public server", r.json.joined === study.id && r.json.servers.some((s) => s.id === study.id));
r = await call("lia", `/api/chat?ch=${gen}`);
ok("members can read its channels", r.status === 200 && r.json.channels.some((c) => c.id === gen && c.serverId === study.id));
r = await chat("lia", { ch: gen, text: "hello squad @sam" });
ok("members can post", r.status === 200 && r.json.messages.some((m) => m.text === "hello squad @sam"), r.json.error);
r = await call("zed", "/api/chat?ch=general");
ok("server channels aren't listed for outsiders", !r.json.channels.some((c) => c.serverId));

r = await sv("zed", { action: "join", code: `https://example.com/chat?join=${secret.invite}` });
ok("join an invite-only server with its invite link", r.json.joined === secret.id, r.json.error);
const oldInvite = secret.invite;
r = await sv("sam", { action: "invite", id: secret.id });
ok("make a new invite", !!r.json.invite && r.json.invite !== oldInvite);
r = await sv("moe", { action: "join", code: oldInvite });
ok("…the old one stops working", r.status === 400, `${r.status} ${r.json.error || r.json.joined}`);

/* ---------- mentions only reach members ---------- */
await sleep(1100);
await chat("sam", { ch: gen, text: "hey @lia and @moe" });
await sleep(300);
r = await call("lia", "/api/me");
const told = (r.json.notifications || []).find((n) => n.kind === "mention" && n.text.includes("Study Squad"));
ok("members are told about @mentions (with the server's name)", !!told, JSON.stringify((r.json.notifications || []).slice(0, 2)));
r = await call("moe", "/api/me");
ok("…people outside the server aren't", !(r.json.notifications || []).some((n) => n.kind === "mention" && n.text.includes("Study Squad")));

/* ---------- channels ---------- */
r = await sv("lia", { action: "addChannel", id: study.id, channel: { name: "memes" } });
ok("members can't add channels", r.status === 400);
r = await sv("sam", { action: "addChannel", id: study.id, channel: { name: "Homework Help", topic: "Ask away" } });
const hw = r.json.channels?.find((c) => c.name === "homework-help");
ok("the owner can add a channel", !!hw && hw.topic === "Ask away" && r.json.servers.find((s) => s.id === study.id).channels.includes(hw.id), r.json.error);
r = await sv("sam", { action: "removeChannel", id: study.id, ch: hw.id });
ok("…and remove it", !r.json.servers.find((s) => s.id === study.id).channels.includes(hw.id));
ok("a server keeps at least one channel", (await sv("sam", { action: "removeChannel", id: study.id, ch: gen })).status === 400);

/* ---------- server moderators ---------- */
r = await call("lia", `/api/chat?ch=${gen}`);
const liaMsg = r.json.messages.find((m) => m.user === "lia");
ok("members can't delete others' messages", (await chat("zed", { action: "delete", ch: gen, id: liaMsg.id })).status >= 400);
r = await sv("lia", { action: "mod", id: study.id, user: "lia" });
ok("only the owner makes moderators", r.status === 400);
await sv("sam", { action: "mod", id: study.id, user: "lia", on: true });
await sv("zed", { action: "join", id: study.id });
await sleep(1100);
r = await chat("zed", { ch: gen, text: "spam spam" });
const zedMsg = r.json.messages.find((m) => m.user === "zed");
r = await chat("lia", { action: "delete", ch: gen, id: zedMsg.id });
ok("a server moderator can delete messages in their server", r.status === 200 && !r.json.messages.some((m) => m.id === zedMsg.id), r.json.error);
ok("…but not in the class chat", (await chat("lia", { action: "delete", ch: "general", id: "nope" })).status >= 400);
r = await chat("lia", { action: "pin", ch: gen, id: liaMsg.id, pinned: true });
ok("…and pin there", r.status === 200 && r.json.pins.some((p) => p.id === liaMsg.id), r.json.error);

/* ---------- kick & ban ---------- */
r = await sv("lia", { action: "kick", id: study.id, user: "zed" });
ok("kick someone", r.status === 200 && !r.json.servers.find((s) => s.id === study.id).members.includes("zed"));
ok("…they can join again", (await sv("zed", { action: "join", id: study.id })).json.joined === study.id);
r = await sv("sam", { action: "ban", id: study.id, user: "zed" });
ok("ban someone", r.json.servers.find((s) => s.id === study.id).banned.includes("zed"));
ok("…they can't come back", (await sv("zed", { action: "join", id: study.id })).status === 400);
ok("…or read it", (await call("zed", `/api/chat?ch=${gen}`)).status >= 400);
await sv("sam", { action: "unban", id: study.id, user: "zed" });
ok("unban", (await sv("zed", { action: "join", id: study.id })).json.joined === study.id);
ok("the owner can't be kicked", (await sv("lia", { action: "kick", id: study.id, user: "sam" })).status === 400);
ok("the owner can't leave (they delete instead)", (await sv("sam", { action: "leave", id: study.id })).status === 400);
r = await sv("zed", { action: "leave", id: study.id });
ok("members can leave", !r.json.servers.some((s) => s.id === study.id));

/* ---------- staff oversight ---------- */
r = await sv("sowner", undefined);
ok("staff see every server, invite-only too", r.json.staff === true && r.json.all.some((s) => s.id === secret.id));
ok("staff can read any server's channels", (await call("sowner", `/api/chat?ch=${secret.channels[0]}`)).status === 200);
r = await sv("sowner", { action: "join", id: secret.id });
ok("…and join any server", r.json.joined === secret.id);

/* ---------- limits, the word filter and turning servers off ---------- */
await sv("moe", { action: "create", server: { name: "One" } });
await sv("moe", { action: "create", server: { name: "Two" } });
await sv("moe", { action: "create", server: { name: "Three" } });
ok("you can own up to 3 servers", (await sv("moe", { action: "create", server: { name: "Four" } })).status >= 400);
await bm("sowner", { action: "setSettings", settings: { chatServers: false } });
r = await sv("lia", { action: "create", server: { name: "Nope" } });
ok("admins can turn making servers off", r.status === 400 && /turned off/.test(r.json.error), r.json.error);
r = await sv("lia", undefined);
ok("…the app is told", r.json.enabled === false);
await bm("sowner", { action: "setSettings", settings: { chatServers: true } });

/* ---------- deleting ---------- */
ok("only the owner deletes a server", (await sv("lia", { action: "delete", id: study.id })).status === 400);
r = await sv("sam", { action: "delete", id: study.id });
ok("delete a server", !r.json.servers.some((s) => s.id === study.id));
ok("…its channels are gone", (await call("sowner", `/api/chat?ch=${gen}`)).status >= 400);
ok("logged-out people can't make servers", (await call("nobody", "/api/servers", { action: "create", server: { name: "Hi" } })).status === 401);

done();
