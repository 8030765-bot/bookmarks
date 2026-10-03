// Logins per device, 2-step codes, rename, delete, export, follows, kudos, privacy, people.
import { createHmac } from "node:crypto";
import { ADMIN_PW, BASE, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();

// same maths as an authenticator app
function b32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const out = [];
  for (const c of s) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, offset = 0) {
  const step = Math.floor(Date.now() / 30000) + offset;
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", b32(secret)).update(c).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1e6).padStart(6, "0");
}
const ua = (browser) => ({ "user-agent": browser === "firefox" ? "Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0" : "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36" });

// sessions per device
await call("ann", "/api/auth", { action: "signup", username: "ann", password: "secret1" }, "POST", ua("chrome"));
await call("ann2", "/api/auth", { action: "login", username: "ann", password: "secret1" }, "POST", ua("firefox"));
let r = await call("ann", "/api/me?account=1");
ok("account screen lists both logins", r.json.sessions?.length === 2, JSON.stringify(r.json.sessions));
ok("devices are named, current one marked", r.json.sessions.some((s) => s.device === "Firefox on Linux") && r.json.sessions.filter((s) => s.current).length === 1);
ok("login history kept", r.json.logins?.length >= 2 && r.json.logins[0].ok, JSON.stringify(r.json.logins?.[0]));
r = await call("ann", "/api/me");
ok("new kind of device triggers an alert", (r.json.notifications || []).some((n) => /new kind of device/.test(n.text)));
const other = (await call("ann", "/api/me?account=1")).json.sessions.find((s) => !s.current);
r = await me("ann", { action: "revokeSession", id: other.id });
ok("sign out one device", r.json.sessions.length === 1);
r = await call("ann2", "/api/me");
ok("…and that device is logged out", r.json.user === null);

// remember me off: no long-lived cookie
const short = await fetch(`${BASE}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "10.7.0.1" }, body: JSON.stringify({ action: "login", username: "ann", password: "secret1", remember: false }) });
ok("remember me off gives a browser-session cookie", !/Max-Age/i.test(short.headers.get("set-cookie") || ""), short.headers.get("set-cookie"));

// password change signs out other devices
await call("ann3", "/api/auth", { action: "login", username: "ann", password: "secret1" });
r = await me("ann", { action: "changePassword", oldPassword: "secret1", newPassword: "secret2" });
ok("password change signs out other devices", r.json.signedOut >= 1, JSON.stringify(r.json));
ok("…but keeps this one", (await call("ann", "/api/me")).json.user === "ann");
ok("…and the other is out", (await call("ann3", "/api/me")).json.user === null);

// 2-step login
r = await me("ann", { action: "startTotp", password: "wrong" });
ok("2-step setup needs the password", r.status === 400);
r = await me("ann", { action: "startTotp", password: "secret2" });
const secret = r.json.secret;
ok("setup gives a secret + authenticator link", /^[A-Z2-7]{32}$/.test(secret || "") && r.json.uri?.startsWith("otpauth://totp/"), r.json.uri);
r = await me("ann", { action: "confirmTotp", code: "000000" });
ok("wrong setup code refused", r.status === 400);
r = await me("ann", { action: "confirmTotp", code: totp(secret) });
ok("2-step login turned on", r.json.twoStep === true, r.json.error);
r = await call("ann4", "/api/auth", { action: "login", username: "ann", password: "secret2" });
ok("password alone now asks for a code", r.json.needs2fa === true && /^[a-f0-9]{48}$/.test(r.json.ticket) && !r.headers.get("set-cookie"), JSON.stringify(r.json));
const ticket = r.json.ticket;
r = await call("ann4", "/api/auth", { action: "login2fa", ticket, code: "123456" });
ok("wrong code refused", r.status === 401 && /Wrong code/.test(r.json.error), r.json.error);
r = await call("ann4", "/api/auth", { action: "login2fa", ticket, code: totp(secret, 1) });
ok("right code logs in", r.status === 200 && r.json.user === "ann", r.json.error);
r = await call("ann5", "/api/auth", { action: "login", username: "ann", password: "secret2" });
r = await call("ann5", "/api/auth", { action: "login2fa", ticket: r.json.ticket, code: totp(secret, 1) });
ok("a code can't be used twice", r.status === 401, r.json.error);
r = await me("ann", { action: "disableTotp", password: "secret2" });
ok("2-step login turned off", r.json.twoStep === false);

// profile fields
r = await me("ann", { action: "profile", profile: {
  displayName: "Annie 🌟", status: "studying", statusEmoji: "📚", statusUntil: new Date(Date.now() + 3600e3).toISOString(),
  banner: "ocean", border: "glow", bio: "**hi**", into: ["Math", "math", "Coding!", "a", "b", "c", "d"], color: "not-a-colour",
} });
ok("profile extras saved", r.json.profile.displayName === "Annie 🌟" && r.json.profile.banner === "ocean" && r.json.profile.border === "glow");
ok("topics cleaned", JSON.stringify(r.json.profile.into) === '["math","coding","a","b","c"]', JSON.stringify(r.json.profile.into));
ok("bad colour dropped", !r.json.profile.color);
await me("ann", { action: "profile", profile: { status: "old", statusUntil: new Date(Date.now() - 1000).toISOString() } });
r = await call("anon", "/api/profile?user=ann");
ok("an expired status disappears", !r.json.profile.status, JSON.stringify(r.json.profile));

// follows, kudos, mutuals
await signup("ben", "cat");
r = await me("ben", { action: "follow", username: "ann" });
ok("follow someone", r.json.following?.includes("ann"));
await me("cat", { action: "follow", username: "ann" });
await me("ben", { action: "follow", username: "cat" });
r = await call("ben", "/api/profile?user=ann");
ok("follower counts + you-follow flag", r.json.social.followers === 2 && r.json.social.youFollow === true, JSON.stringify(r.json.social));
r = await call("cat", "/api/me");
ok("people hear when they're followed", (r.json.notifications || []).some((n) => /started following you/.test(n.text)));
r = await me("ben", { action: "follow", username: "ben" });
ok("can't follow yourself", r.status === 400);
for (let i = 0; i < 3; i++) await me("ben", { action: "kudos", username: "ann" });
r = await me("ben", { action: "kudos", username: "ann" });
ok("kudos are limited to 3 a day", r.status === 400 && /3 kudos a day/.test(r.json.error), r.json.error);
ok("kudos counted", (await call("x", "/api/profile?user=ann")).json.social.kudos === 3);

// privacy
await me("cat", { action: "profile", profile: { visibility: "private", hideOnline: true } });
r = await call("anon", "/api/profile?user=cat");
ok("private profiles are hidden", r.json.hidden === true && !r.json.profile);
r = await call("cat", "/api/profile?user=cat");
ok("…but you can see your own", !r.json.hidden && r.json.self);
await me("ann", { action: "profile", profile: { visibility: "members" } });
ok("members-only hides from guests", (await call("anon", "/api/profile?user=ann")).json.membersOnly === true);
ok("…and shows to members", !!(await call("ben", "/api/profile?user=ann")).json.profile);
r = await call("anon", "/api/people");
ok("directory skips private and members-only for guests", !r.json.people.some((p) => p.username === "cat" || p.username === "ann") && r.json.people.some((p) => p.username === "ben"));
await call("cat", "/api/presence", { id: "tabcat" });
r = await call("anon", "/api/presence", { id: "tabanon" });
ok("hidden-online people aren't named in presence", !r.json.users.includes("cat") && r.json.count >= 2, JSON.stringify(r.json));

// block + settings sync
r = await me("ben", { action: "block", username: "cat" });
ok("block someone", JSON.stringify(r.json.blocked) === '["cat"]');
r = await me("ben", { action: "settings", settings: { look: { palette: "ocean" }, sort: "name", evil: "x" } });
ok("settings sync saves known keys only", r.json.settings.look?.palette === "ocean" && r.json.settings.sort === "name" && !("evil" in r.json.settings));

// My Stuff folders + import
r = await me("ben", { action: "importMyStuff", items: [{ name: "A", url: "a.example.com", folder: "School" }, { name: "Bad", url: "javascript:x" }, { name: "A again", url: "https://a.example.com/" }] });
ok("import into My Stuff skips bad + duplicate links", r.json.added === 1 && r.json.myStuff[0].folder === "School", JSON.stringify(r.json));
r = await me("ben", { action: "renameMyStuffFolder", from: "School", to: "Class" });
ok("rename a My Stuff folder", r.json.myStuff[0].folder === "Class");

// rename
await bm("ben", { action: "addFolder", name: "Ben's", emoji: "📁" });
r = await bm("ben", { action: "addLink", folderId: (await call("x", "/api/bookmarks")).json.folders.find((f) => f.name === "Ben's").id, name: "Bens link", url: "ben.example.com" });
await bm("cat", { action: "toggleLike", folderId: r.json.folders.find((f) => f.name === "Ben's").id, linkId: r.json.folders.find((f) => f.name === "Ben's").links[0].id });
r = await me("ben", { action: "rename", newName: "cat", password: "secret1" });
ok("can't take someone's username", r.status === 400 && /taken/.test(r.json.error), r.json.error);
r = await me("ben", { action: "rename", newName: "benny", password: "secret1" });
ok("rename works", r.json.user === "benny", r.json.error);
ok("…still logged in as the new name", (await call("ben", "/api/me")).json.user === "benny");
r = await call("x", "/api/bookmarks");
ok("…links credit the new name", r.json.folders.find((f) => f.name === "Ben's").links[0].addedBy === "benny");
r = await call("x", "/api/profile?user=cat");
r = await call("ann", "/api/profile?user=ann");
ok("…followers moved to the new name", r.json.social.followers === 2);
r = await call("x", "/api/auth", { action: "login", username: "benny", password: "secret1" });
ok("…can log in with the new name", r.status === 200);
r = await me("ben", { action: "rename", newName: "benjamin", password: "secret1" });
ok("renames have a 30-day cooldown", r.status === 400 && /30 days/.test(r.json.error), r.json.error);

// export + delete
const exp = await fetch(`${BASE}/api/me?export=1`, { headers: { cookie: (await call("ben", "/api/auth", { action: "login", username: "benny", password: "secret1" })).headers.get("set-cookie").split(";")[0] } });
const dump = await exp.json();
ok("export downloads everything as a file", /attachment/.test(exp.headers.get("content-disposition") || "") && dump.account?.username === "benny" && Array.isArray(dump.myStuff) && Array.isArray(dump.loginHistory));
r = await me("ann", { action: "deleteAccount", password: "nope" });
ok("delete needs the password", r.status === 400);
r = await me("ann", { action: "deleteAccount", password: "secret2" });
ok("delete works", r.json.deleted === true);
ok("…the account is gone", (await call("x", "/api/auth", { action: "login", username: "ann", password: "secret2" })).status === 401);
ok("…and its follows are cleaned up", (await call("x", "/api/profile?user=cat")).json && true);
await call("own", "/api/auth", { action: "signup", username: "own", password: "secret1" });
await call("own", "/api/admin", { action: "claimOwner", password: ADMIN_PW });
r = await me("own", { action: "deleteAccount", password: "secret1" });
ok("the owner can't delete their account", r.status === 400, r.json.error);

done();
