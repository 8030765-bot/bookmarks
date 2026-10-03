// Links, likes, polls, chat, presence, leaderboard and browser import.
import { ADMIN_PW, bm, call, done, ok, signup, sleep, waitForServer } from "./helpers.mjs";

await waitForServer();
const admin = (b) => bm("admin", { ...b, password: ADMIN_PW });
await call("alice", "/api/auth", { action: "signup", username: "Alice", password: "secret1" });
await call("bob", "/api/auth", { action: "signup", username: "Bob", password: "secret1" });

// attribution
let r = await bm("alice", { action: "addLink", folderId: "hubs", name: "Alice Site", url: "alice.example.com" });
const link = r.json.folders.find((f) => f.id === "hubs").links.find((l) => l.name === "Alice Site");
ok("addedBy recorded", link?.addedBy === "Alice", link?.addedBy);
r = await bm("anon", { action: "addLink", folderId: "hubs", name: "Spoof", url: "spoof.example.com", __user: "Bob" });
const spoof = r.json.folders.find((f) => f.id === "hubs").links.find((l) => l.name === "Spoof");
ok("client can't fake __user", spoof && !spoof.addedBy, String(spoof?.addedBy));

// input limits
r = await bm("alice", { action: "addLink", folderId: "hubs", name: "x".repeat(500), url: "long.example.com", tags: ["A", "a", "b,c", ...Array(20).fill("t")], color: "red;}" });
const long = r.json.folders.find((f) => f.id === "hubs").links.find((l) => l.url.includes("long.example.com"));
ok("names are capped at 100 chars", long?.name.length === 100, String(long?.name.length));
ok("tags are cleaned, de-duplicated and capped", JSON.stringify(long?.tags) === '["a","bc","t"]', JSON.stringify(long?.tags));
ok("bad colors are dropped", long && long.color === undefined, String(long?.color));
r = await bm("alice", { action: "addLink", folderId: "hubs", name: "JS", url: "javascript:alert(1)" });
ok("javascript: links rejected", r.status === 400, r.json.error);

// likes
const hubs = (j) => j.folders.find((f) => f.id === "hubs");
r = await bm("anon", { action: "toggleLike", folderId: "hubs", linkId: link.id, __user: "Bob" });
ok("anonymous like blocked", r.status === 401, r.json.error);
r = await bm("bob", { action: "toggleLike", folderId: "hubs", linkId: link.id });
ok("bob likes", JSON.stringify(hubs(r.json).links.find((l) => l.id === link.id).likes) === '["bob"]');
await bm("alice", { action: "toggleLike", folderId: "hubs", linkId: link.id });
r = await bm("bob", { action: "toggleLike", folderId: "hubs", linkId: link.id });
ok("unlike toggles off", JSON.stringify(hubs(r.json).links.find((l) => l.id === link.id).likes) === '["alice"]');
await bm("bob", { action: "toggleLike", folderId: "hubs", linkId: link.id });

// polls
r = await bm("anon", { action: "createPoll", question: "x", options: ["a", "b"] });
ok("non-admin can't create poll", r.status === 403);
r = await admin({ action: "createPoll", question: "Best game?", options: ["Level Devil", "Car Soccer", " "] });
const poll = r.json.polls?.[0];
ok("poll created (blank option dropped)", poll?.options.length === 2, JSON.stringify(poll?.options));
await bm("alice", { action: "votePoll", pollId: poll.id, option: 0 });
await bm("bob", { action: "votePoll", pollId: poll.id, option: 1 });
r = await bm("bob", { action: "votePoll", pollId: poll.id, option: 1 });
ok("vote again = take back", JSON.stringify(r.json.polls[0].votes) === '{"alice":0}', JSON.stringify(r.json.polls[0].votes));
r = await bm("anon", { action: "votePoll", pollId: poll.id, option: 0 });
ok("anonymous vote blocked", r.status === 401);
r = await bm("bob", { action: "votePoll", pollId: poll.id, option: 7 });
ok("bad option rejected", r.status >= 400 && r.status < 500, r.json.error);
await admin({ action: "closePoll", pollId: poll.id });
r = await bm("bob", { action: "votePoll", pollId: poll.id, option: 0 });
ok("closed poll rejects votes", r.status === 400, r.json.error);

// chat reactions + replies
r = await call("alice", "/api/chat", { text: "hi @Bob check https://example.com" });
const first = r.json.messages.at(-1);
await sleep(1100);
r = await call("bob", "/api/chat", { text: "hey!", replyTo: first.id });
ok("reply stores quote", r.json.messages.at(-1).replyTo?.user === "Alice", JSON.stringify(r.json.messages.at(-1).replyTo));
await call("bob", "/api/chat", { action: "react", id: first.id, emoji: "🔥" });
r = await call("alice", "/api/chat", { action: "react", id: first.id, emoji: "🔥" });
ok("two reactions", r.json.messages.find((m) => m.id === first.id).reactions?.["🔥"]?.length === 2);
r = await call("alice", "/api/chat", { action: "react", id: first.id, emoji: "🔥" });
ok("reaction toggles off", r.json.messages.find((m) => m.id === first.id).reactions?.["🔥"]?.length === 1);
r = await call("alice", "/api/chat", { action: "react", id: first.id, emoji: "<script>" });
ok("unknown emoji rejected", r.status === 400, r.json.error);

// presence
await call("alice", "/api/presence", { id: "tabA" });
await call("alice", "/api/presence", { id: "tabA2" });
r = await call("anon", "/api/presence", { id: "guest1" });
ok("presence counts users once + guests", r.json.count === 2 && JSON.stringify(r.json.users) === '["Alice"]', JSON.stringify(r.json));

// community
r = await call("anon", "/api/community");
const a = r.json.leaders.find((l) => l.username === "Alice");
ok("leaderboard stats", a?.added === 2 && a?.likesReceived === 2 && a?.messages === 1, JSON.stringify(a));
ok("Alice ranks first", r.json.leaders[0]?.username === "Alice");

// browser import
r = await admin({ action: "addFolders", folders: [{ name: "From Chrome", links: [{ name: "Good", url: "https://good.example" }, { name: "Bad", url: "javascript:alert(1)" }, { name: "Chrome", url: "chrome://settings" }] }] });
const imported = r.json.folders?.find((f) => f.name === "From Chrome");
ok("import keeps only web links", imported?.links.length === 1, JSON.stringify(imported?.links.map((l) => l.url)));
r = await bm("anon", { action: "addFolders", folders: [] });
ok("import is admin-only", r.status === 403);

done();
