// Per-account data: favorites, ratings, notifications, profiles.
import { bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("adder", "rater", "rater2");

let r = await bm("adder", { action: "addFolder", name: "PF", emoji: "📁" });
const fid = r.json.folders.find((f) => f.name === "PF").id;
r = await bm("adder", { action: "addLink", folderId: fid, name: "Cool", url: "cool.example.com" });
const link = r.json.folders.find((f) => f.id === fid).links[0];

r = await me("rater", { action: "favorite", linkId: link.id });
ok("favorite is per-account", JSON.stringify(r.json.favorites) === JSON.stringify([link.id]));
r = await call("rater2", "/api/me");
ok("another account doesn't see it", (r.json.favorites || []).length === 0);
r = await call("x", "/api/bookmarks");
ok("favorites don't touch shared data", !r.json.folders.find((f) => f.id === fid).links[0].favorite);

await me("rater", { action: "rate", linkId: link.id, stars: 5 });
await me("rater2", { action: "rate", linkId: link.id, stars: 3 });
r = await call("x", "/api/ratings");
ok("aggregate rating averages", r.json.ratings[link.id]?.avg === 4 && r.json.ratings[link.id]?.count === 2, JSON.stringify(r.json.ratings[link.id]));
await me("rater2", { action: "rate", linkId: link.id, stars: 0 });
r = await call("x", "/api/ratings");
ok("clearing a rating updates the average", r.json.ratings[link.id]?.avg === 5 && r.json.ratings[link.id]?.count === 1, JSON.stringify(r.json.ratings[link.id]));

await bm("rater", { action: "toggleLike", folderId: fid, linkId: link.id });
r = await call("adder", "/api/me");
ok("adder gets a like notification", (r.json.notifications || []).some((n) => n.kind === "like"));

await me("adder", { action: "profile", profile: { avatar: "🦊", bio: "hi there", color: "#3dd68c" } });
r = await call("x", "/api/profile?user=adder");
ok("public profile shows bio + stats", r.json.profile?.bio === "hi there" && r.json.added === 1 && r.json.likesReceived === 1, JSON.stringify({ p: r.json.profile, added: r.json.added }));

await call("rater", "/api/chat", { text: "hey @adder look at this" });
r = await call("adder", "/api/me");
ok("mention creates a notification", (r.json.notifications || []).some((n) => n.kind === "mention"));

r = await me("nobody", { action: "favorite", linkId: link.id });
ok("logged-out blocked from personal data", r.status === 401);

done();
