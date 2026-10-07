// Recovery codes, password change and admin resets.
import { ADMIN_PW, adm, call, done, me, ok, waitForServer } from "./helpers.mjs";

await waitForServer();

let r = await call("amy", "/api/auth", { action: "signup", username: "amy", password: "secret1" });
ok("signup returns a recovery code", /^[a-f0-9]{12}$/.test(r.json.recoveryCode || ""), r.json.recoveryCode);
const code = r.json.recoveryCode;

r = await call("x", "/api/auth", { action: "reset", username: "amy", code: "000000000000", newPassword: "newpass1" });
ok("wrong recovery code rejected", r.status === 401, r.json.error);

r = await call("x", "/api/auth", { action: "reset", username: "amy", code: code.replace(/(.{4})/g, "$1 ").toUpperCase(), newPassword: "newpass1" });
ok("reset with code works (spaces + caps ok)", r.status === 200 && /^[a-f0-9]{12}$/.test(r.json.recoveryCode || ""), r.json.recoveryCode);
const code2 = r.json.recoveryCode;

r = await call("x", "/api/auth", { action: "login", username: "amy", password: "secret1" });
ok("old password rejected after reset", r.status === 401);
r = await call("amy", "/api/auth", { action: "login", username: "amy", password: "newpass1" });
ok("new password works", r.status === 200);

r = await call("x", "/api/auth", { action: "reset", username: "amy", code, newPassword: "another1" });
ok("old recovery code no longer valid", r.status === 401);
r = await call("x", "/api/auth", { action: "reset", username: "amy", code: code2, newPassword: "another1" });
ok("rotated recovery code works", r.status === 200);

await call("amy", "/api/auth", { action: "login", username: "amy", password: "another1" });
r = await me("amy", { action: "changePassword", oldPassword: "wrong", newPassword: "zzz12345" });
ok("change password needs the current one", r.status === 400, r.json.error);
r = await me("amy", { action: "changePassword", oldPassword: "another1", newPassword: "zzz12345" });
ok("change password works", r.status === 200);

await call("ownr", "/api/auth", { action: "signup", username: "ownr", password: "secret1" });
await adm("ownr", { action: "claimOwner", password: ADMIN_PW });
r = await adm("ownr", { action: "resetPassword", username: "amy" });
ok("admin reset returns a temp password", /^reset-[a-f0-9]{6}$/.test(r.json.tempPassword || ""), r.json.tempPassword);
r = await call("amy2", "/api/auth", { action: "login", username: "amy", password: r.json.tempPassword });
ok("temp password logs in", r.status === 200);
r = await adm("rando", { action: "resetPassword", username: "amy" });
ok("non-admin can't reset others", r.status === 403, r.json.error);

let limited = false;
for (let i = 0; i < 10; i++) {
  const rr = await call("x", "/api/auth", { action: "reset", username: "amy", code: "deadbeefdead", newPassword: "pwpwpw1" });
  if (rr.status === 429) limited = true;
}
ok("reset is rate-limited", limited);

done();
