// The design builder's AI: making a page, the daily limit of 15 messages
// (the owner has none), cleaning up what the AI sends back, and who can
// use it. The AI itself is a stand-in (tests never use the internet).
import { ADMIN_PW, adm, bm, call, done, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("aiowner", "ava", "ben");
await adm("aiowner", { action: "claimOwner", password: ADMIN_PW });

const ai = (who, body) => call(who, "/api/designs/ai", body);
const design = { canvas: { bg: "#000000", text: "#ffffff", accent: "#7c6cff" }, pieces: [{ id: "pclock1", part: "clock", x: 0, y: 0, w: 8, h: 6, z: 1 }] };

let r = await ai("ava");
ok("everyone starts with 15 messages a day", r.json.limit === 15 && r.json.left === 15 && r.json.unlimited === false, JSON.stringify(r.json));

r = await ai("ava", { message: "make me a cosy page", design });
ok("the AI builds a page", r.status === 200 && r.json.action === "replace" && r.json.reply === "Here's a cosy page", r.json.error);
ok("…with its pieces", r.json.design?.pieces.some((p) => p.part === "clock" && p.props.size === "xl") && r.json.design.pieces.some((p) => p.part === "folders"));
ok("…without made-up parts", !r.json.design?.pieces.some((p) => p.part === "not-real") && r.json.design.pieces.every((p) => /^[a-z0-9]{3,24}$/i.test(p.id)));
ok("…and the page colours", r.json.design?.canvas.bg === "#101828" && r.json.design.canvas.accent === "#ff8a3d");
ok("it counts the message", r.json.usage?.left === 14);

r = await ai("ava", { message: "just chat: any ideas?", design });
ok("just chatting changes nothing", r.json.action === "none" && !r.json.design && r.json.reply.startsWith("Try"));

for (let i = 0; i < 13; i++) await ai("ava", { message: "just chat", design });
r = await ai("ava");
ok("15 used", r.json.left === 0);
r = await ai("ava", { message: "one more please", design });
ok("the 16th is turned away", r.status === 429 && /15 AI messages/.test(r.json.error || ""), `${r.status} ${r.json.error}`);
ok("…and doesn't count", (await ai("ava")).json.used === 15);

r = await ai("ben", { message: "make me a page", design });
ok("each person has their own 15", r.status === 200 && r.json.usage.left === 14);

for (let i = 0; i < 16; i++) r = await ai("aiowner", { message: "just chat", design });
ok("the owner has no limit", r.status === 200 && r.json.usage.unlimited === true && r.json.usage.left === null, `${r.status} ${r.json.error}`);

ok("logged-out people can't use it", (await call("nobody", "/api/designs/ai", { message: "hi", design })).status === 401);
ok("an empty message is turned away", (await ai("ben", { message: "   ", design })).status === 400);

await bm("aiowner", { action: "setSettings", settings: { wordFilter: ["cosy"] } });
r = await ai("ben", { message: "make me a page", design });
ok("the word filter covers the AI's words", r.json.reply && !/cosy/i.test(r.json.reply), r.json.reply);

done();
