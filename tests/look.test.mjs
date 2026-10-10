// Look & feel settings kept on the server: default theme for new visitors,
// theme of the month, April Fools mode, and the theme shown on a profile.
import { ADMIN_PW, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("boss", "kim");
await adm("boss", { action: "claimOwner", password: ADMIN_PW });
const CODE = "TB1.eyJwYWxldHRlIjoib2NlYW4iLCJhY2NlbnQiOiIjM2RkNjhjIn0";

let r = await bm("kim", { action: "setSettings", settings: { aprilFools: true } });
ok("members can't change site look settings", r.status === 403, r.json.error);

r = await bm("boss", { action: "setSettings", settings: { defaultTheme: CODE } });
ok("admin sets the default theme", r.json.settings?.defaultTheme === CODE);
r = await bm("boss", { action: "setSettings", settings: { defaultTheme: "<script>alert(1)</script>" } });
ok("junk default theme is dropped", !r.json.settings?.defaultTheme);

r = await bm("boss", { action: "setSettings", settings: { themeOfMonth: { code: CODE, name: "  Ocean breeze  " } } });
ok("theme of the month saved and tidied", r.json.settings?.themeOfMonth?.code === CODE && r.json.settings.themeOfMonth.name === "Ocean breeze");
r = await bm("boss", { action: "setSettings", settings: { themeOfMonth: { code: "nope", name: "x" } } });
ok("theme of the month needs a real code", !r.json.settings?.themeOfMonth);
await bm("boss", { action: "setSettings", settings: { themeOfMonth: { code: CODE, name: "Ocean breeze" } } });
r = await bm("boss", { action: "setSettings", settings: { themeOfMonth: null } });
ok("theme of the month can be cleared", !r.json.settings?.themeOfMonth);

r = await bm("boss", { action: "setSettings", settings: { aprilFools: true } });
ok("April Fools on", r.json.settings?.aprilFools === true);
r = await call("guest", "/api/bookmarks");
ok("everyone sees April Fools is on", r.json.settings?.aprilFools === true);
r = await bm("boss", { action: "setSettings", settings: { aprilFools: false } });
ok("April Fools off", !r.json.settings?.aprilFools);

r = await me("kim", { action: "profile", profile: { themeCode: CODE } });
ok("show a theme on your profile", r.json.profile?.themeCode === CODE, JSON.stringify(r.json));
r = await call("guest", "/api/profile?user=kim");
ok("others can see it", r.json.profile?.themeCode === CODE);
r = await me("kim", { action: "profile", profile: { themeCode: "javascript:alert(1)" } });
ok("a bad theme code is not saved", !r.json.profile?.themeCode);

done();
