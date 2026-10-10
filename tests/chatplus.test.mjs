// Chat extras: pictures (checked by a moderator first), picture-only
// messages, turning pictures off, deleting removes the picture, and
// per-channel notification levels.
import { ADMIN_PW, adm, bm, call, done, me, ok, signup, sleep, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("owner1", "kai", "ben");
await adm("owner1", { action: "claimOwner", password: ADMIN_PW });

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const chat = (who, body) => call(who, "/api/chat", body);

/* ---------- pictures ---------- */
let r = await chat("kai", { ch: "general", text: "look at this", image: PNG });
const sent = r.json.messages?.find((m) => m.user === "kai");
ok("send a picture with a message", !!sent?.img && sent.imgPending === true && sent.text === "look at this", JSON.stringify(r.json).slice(0, 200));
ok("…others can't see it yet", (await call("ben", `/api/img/${sent.img}`)).status === 404);
ok("…the sender can", (await call("kai", `/api/img/${sent.img}`)).status === 200);
r = await adm("owner1", { action: "overview" });
ok("it's in the pictures queue", r.json.pictures.some((p) => p.id === sent.img && p.kind === "chat"));
await adm("owner1", { action: "reviewPicture", id: sent.img, ok: true });
r = await call("ben", "/api/chat?ch=general");
const after = r.json.messages.find((m) => m.id === sent.id);
ok("approved: everyone sees it", after.img === sent.img && !after.imgPending && (await call("ben", `/api/img/${sent.img}`)).status === 200);

await sleep(1100);
r = await chat("kai", { ch: "general", text: "", image: PNG });
const only = r.json.messages?.filter((m) => m.user === "kai").pop();
ok("a picture on its own is fine", !!only?.img && only.text === "", r.json.error);
await adm("owner1", { action: "reviewPicture", id: only.img, ok: false, reason: "Not for chat" });
r = await call("ben", "/api/chat?ch=general");
const rejected = r.json.messages.find((m) => m.id === only.id);
ok("rejected: the picture comes out of the message", !rejected.img && /removed/.test(rejected.text), JSON.stringify(rejected));
r = await me("kai");
ok("…and they're told why", r.json.notifications.some((n) => /chat picture wasn't approved: Not for chat/.test(n.text)));

await sleep(1100);
r = await chat("kai", { ch: "general", text: "" });
ok("an empty message without a picture is refused", r.status === 400);
r = await chat("kai", { ch: "general", text: "bad", image: "data:image/png;base64,PHN2Zz4=" });
ok("not-really-pictures are refused", r.status === 400);

// deleting your message removes its picture
await sleep(1100);
r = await chat("kai", { ch: "general", text: "oops", image: PNG });
const oops = r.json.messages.filter((m) => m.user === "kai").pop();
await chat("kai", { ch: "general", action: "delete", id: oops.id });
ok("deleting the message deletes the picture", (await call("owner1", `/api/img/${oops.img}`)).status === 404);

// admins can switch pictures off
await bm("owner1", { action: "setSettings", settings: { chatImages: false } });
await sleep(1100);
r = await chat("ben", { ch: "general", text: "pic", image: PNG });
ok("pictures can be turned off", r.status === 400 && /turned off/.test(r.json.error), r.json.error);
r = await call("ben", "/api/chat?ch=general");
ok("…and the page is told", r.json.images === false);
r = await chat("owner1", { ch: "general", text: "staff pic", image: PNG });
const staffPic = r.json.messages?.filter((m) => m.user === "owner1").pop();
ok("staff still can, with no wait", !!staffPic?.img && !staffPic.imgPending);
await bm("owner1", { action: "setSettings", settings: { chatImages: true } });

/* ---------- notification levels ---------- */
r = await chat("ben", { ch: "random", action: "notifyLevel", level: "none" });
ok("set a channel to Nothing", r.json.notifyLevels?.random === "none", JSON.stringify(r.json));
const before = (await me("ben")).json.notifications.length;
await sleep(1100);
await chat("kai", { ch: "random", text: "hey @ben look" });
r = await me("ben");
ok("…no notification for mentions there", r.json.notifications.length === before);
await sleep(1100);
await chat("kai", { ch: "general", text: "hey @ben over here" });
r = await me("ben");
ok("…other channels still notify", r.json.notifications.length === before + 1);
r = await chat("ben", { ch: "random", action: "notifyLevel", level: "all" });
ok("back to everything", r.json.notifyLevels?.random === undefined);
r = await call("ben", "/api/chat?ch=general");
ok("levels come with the messages", typeof r.json.notifyLevels === "object");

done();
