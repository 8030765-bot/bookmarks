// Owner / admin / moderator permissions and the audit log.
import { ADMIN_PW, adm, bm, done, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("owner", "ally", "mod1", "rando");

// before an owner exists, the shared password still works
let r = await bm("rando", { action: "addFolder", name: "PW folder", emoji: "📁", password: ADMIN_PW });
ok("shared password works before owner exists", r.status === 200);
const pwFolder = r.json.folders.at(-1).id;
r = await bm("rando", { action: "deleteFolder", folderId: pwFolder });
ok("…but not without it", r.status === 403, r.json.error);

// claim ownership
r = await adm("rando", { action: "claimOwner" });
ok("claimOwner needs the password", r.status >= 400, r.json.error);
r = await adm("owner", { action: "claimOwner", password: ADMIN_PW });
ok("owner claimed", r.json.role === "owner");
r = await adm("ally", { action: "claimOwner", password: ADMIN_PW });
ok("can't claim twice", r.status === 400, r.json.error);

// password retired now that an owner exists
r = await bm("rando", { action: "editFolder", folderId: pwFolder, name: "Hax", password: ADMIN_PW });
ok("shared password retired after owner exists", r.status === 403, r.json.error);
r = await bm("owner", { action: "editFolder", folderId: pwFolder, name: "Owner edit" });
ok("owner edits with no password (session only)", r.status === 200);

// owner assigns roles
r = await adm("owner", { action: "setRole", username: "ally", role: "admin" });
ok("owner sets admin", r.json.roles?.ally === "admin");
await adm("owner", { action: "setRole", username: "mod1", role: "mod" });
r = await adm("ally", { action: "setRole", username: "rando", role: "admin" });
ok("admins can't manage roles", r.status === 403, r.json.error);
r = await adm("mod1", { action: "setRole", username: "rando", role: "admin" });
ok("mods can't manage roles", r.status === 403);

// admin can edit bookmarks; mod cannot; mod can moderate
r = await bm("ally", { action: "editFolder", folderId: pwFolder, name: "Admin edit" });
ok("admin edits bookmarks", r.status === 200);
r = await bm("mod1", { action: "editFolder", folderId: pwFolder, name: "Mod edit" });
ok("mod cannot edit bookmarks", r.status === 403, r.json.error);
r = await adm("mod1", { action: "overview" });
ok("mod sees overview", r.status === 200 && Array.isArray(r.json.users));
ok("mod overview hides audit log", (r.json.audit || []).length === 0);

// audit
const del = (await bm("ally", { action: "addFolder", name: "ToDelete", emoji: "📁" })).json.folders.find((f) => f.name === "ToDelete").id;
await bm("ally", { action: "deleteFolder", folderId: del });
r = await adm("ally", { action: "overview" });
const actors = (r.json.audit || []).map((a) => `${a.actor}:${a.action}`);
ok("audit names who did what", actors.includes("ally:deleteFolder") && actors.some((a) => a.startsWith("owner:setRole")), actors.slice(0, 4).join(", "));

// transfer ownership
r = await adm("owner", { action: "transferOwner", username: "ally" });
ok("ownership transferred", r.json.roles?.ally === "owner" && r.json.roles?.owner === "admin");
r = await adm("ally", { action: "deleteUser", username: "ally" });
ok("owner account can't be deleted", r.status === 400, r.json.error);
r = await adm("owner", { action: "setRole", username: "mod1", role: null });
ok("former owner (now admin) can't manage roles", r.status === 403);

done();
