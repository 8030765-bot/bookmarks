// The design builder: saving designs, checking what's in them, the
// gallery (with a moderator's check), using and copying designs, who can
// see what, and the admins' default design.
import { ADMIN_PW, adm, bm, call, done, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("downer", "dana", "eli", "fay");
await adm("downer", { action: "claimOwner", password: ADMIN_PW });

const ds = (who, body) => call(who, "/api/designs", body);
const piece = (part, x, y, w, h, extra = {}) => ({ id: `p${part.replace(/[^a-z]/g, "").slice(0, 10)}${x}${y}`, part, x, y, w, h, z: 1, ...extra });

/* ---------- saving ---------- */
let r = await ds("dana", {
  action: "save",
  design: {
    name: "Dana's desk", emoji: "🌸",
    canvas: { bg: "#101020", text: "#ffffff", accent: "#ff5c9a", font: "grotesk", tone: "dark", rows: 50, bgPattern: "aurora" },
    pieces: [
      piece("clock", 0, 0, 8, 6, { props: { size: "xl", seconds: true } }),
      piece("button", 10, 0, 5, 3, { props: { label: "Maths", action: "url", value: "https://example.com", variant: "pill" }, style: { bg: "#ff0000", radius: 12, shadow: "glow" } }),
      piece("folders", 0, 8, 24, 30),
      piece("orbit-dock", 5, 40, 14, 6, { locked: true }),
    ],
  },
});
const mine = r.json.saved;
ok("save a new design", r.status === 200 && /^[a-z0-9]{8}$/.test(mine?.id || "") && mine.owner === "dana", r.json.error);
ok("…with its pieces and page look", mine?.pieces.length === 4 && mine.canvas.font === "grotesk" && mine.canvas.bgPattern === "aurora");
ok("…and each piece's options and style", mine?.pieces[1].props.label === "Maths" && mine.pieces[1].props.variant === "pill" && mine.pieces[1].style.shadow === "glow" && mine.pieces[3].locked === true);
ok("it shows in my designs", r.json.mine.some((d) => d.id === mine.id));

r = await ds("dana", {
  action: "save",
  design: {
    id: mine.id, name: "Dana's desk",
    canvas: { bg: "red; background:url(x)", text: "#fff", accent: "#123456", font: "comic-sans-nope", rows: 99999 },
    pieces: [
      piece("nope-not-a-part", 0, 0, 4, 4),
      piece("clock", -5, -3, 100, 2, { props: { size: "gigantic", hack: "<script>" }, style: { bg: "url(javascript:alert(1))", radius: 5000, font: "evil" } }),
      piece("image", 0, 10, 6, 6, { props: { src: "javascript:alert(1)" } }),
      piece("bgimage", 0, 20, 6, 6, { props: { src: "https://ok.example/a.png\") ; background:red" } }),
    ],
  },
});
const cleaned = r.json.saved;
ok("unknown parts are dropped", cleaned?.pieces.length === 3 && !cleaned.pieces.some((p) => p.part === "nope-not-a-part"), r.json.error);
const clock = cleaned?.pieces.find((p) => p.part === "clock");
ok("sizes and places are kept on the page", clock?.x === 0 && clock.y === 0 && clock.w === 24);
ok("unknown options and bad values are fixed", clock?.props.size === "l" && clock.props.hack === undefined);
ok("bad colours and fonts are ignored", !clock?.style?.bg && !clock?.style?.font && clock?.style?.radius === 999);
ok("the page's bad colour falls back", cleaned?.canvas.bg === "#0f1115" && cleaned.canvas.font === "inter" && cleaned.canvas.rows === 600);
ok("only https pictures", cleaned?.pieces.find((p) => p.part === "image").props.src === "" && cleaned.pieces.find((p) => p.part === "bgimage").props.src === "");

/* ---------- privacy ---------- */
ok("others can't see a private design", (await call("eli", `/api/designs?id=${mine.id}`)).status === 404);
ok("…or change it", (await ds("eli", { action: "save", design: { id: mine.id, name: "mine now" } })).status >= 400);
ok("…or delete it", (await ds("eli", { action: "delete", id: mine.id })).status >= 400);
ok("the designer can", (await call("dana", `/api/designs?id=${mine.id}`)).json.design?.id === mine.id);
ok("staff can look at any design", (await call("downer", `/api/designs?id=${mine.id}`)).status === 200);
ok("logged-out people can't save", (await call("nobody", "/api/designs", { action: "save", design: { name: "x" } })).status === 401);

/* ---------- the gallery ---------- */
r = await ds("dana", { action: "share", id: mine.id });
ok("sharing waits for a moderator", r.json.mine.find((d) => d.id === mine.id).gallery === "pending");
r = await ds("eli");
ok("…so it isn't in the gallery yet", !r.json.gallery.some((d) => d.id === mine.id) && r.json.pending === undefined);
r = await ds("downer");
ok("moderators see it waiting", r.json.staff === true && r.json.pending.some((d) => d.id === mine.id));
ok("members can't approve", (await ds("eli", { action: "approve", id: mine.id })).status >= 400);
r = await ds("downer", { action: "approve", id: mine.id });
ok("a moderator approves it", r.json.gallery.some((d) => d.id === mine.id));
ok("now anyone can see it", (await call("eli", `/api/designs?id=${mine.id}`)).status === 200);

r = await ds("eli", { action: "use", id: mine.id });
ok("using it counts", r.json.gallery.find((d) => d.id === mine.id).uses === 1);
await ds("eli", { action: "use", id: mine.id });
ok("…once per person a day", (await ds("eli")).json.gallery.find((d) => d.id === mine.id).uses === 1);

r = await ds("eli", { action: "copy", id: mine.id });
ok("make your own copy", r.json.saved?.owner === "eli" && r.json.saved.name.includes("copy") && r.json.saved.pieces.length === 3 && !r.json.saved.gallery);

await ds("dana", { action: "save", design: { id: mine.id, name: "Dana's desk v2" } });
r = await ds("dana");
ok("changing a shared design sends it back for a check", r.json.mine.find((d) => d.id === mine.id).gallery === "pending");
await ds("downer", { action: "approve", id: mine.id });

/* ---------- the word filter ---------- */
await bm("downer", { action: "setSettings", settings: { wordFilter: ["badword"] } });
r = await ds("fay", { action: "save", design: { name: "my badword page", pieces: [piece("heading", 0, 0, 10, 4, { props: { text: "hello badword" } })] } });
ok("the word filter covers names and text", !r.json.saved.name.includes("badword") && !r.json.saved.pieces[0].props.text.includes("badword"));

/* ---------- the admins' default design ---------- */
r = await bm("downer", { action: "setSettings", settings: { defaultDesign: mine.id } });
r = await ds("eli");
ok("admins can set the design new visitors start with", r.json.siteDefault === mine.id);
await bm("downer", { action: "setSettings", settings: { defaultDesign: "not valid!" } });
ok("…only a real design id", (await ds("eli")).json.siteDefault === "");

/* ---------- removing ---------- */
r = await ds("downer", { action: "unshare", id: mine.id });
ok("moderators can take a design out of the gallery", !r.json.gallery.some((d) => d.id === mine.id));
r = await ds("dana", { action: "delete", id: mine.id });
ok("delete a design", !r.json.mine.some((d) => d.id === mine.id));

/* ---------- limits ---------- */
let last;
for (let i = 0; i < 12; i++) last = await ds("fay", { action: "save", design: { name: `Design ${i}` } });
ok("you can keep up to 12 designs", last.status >= 400 && /12/.test(last.json.error || ""), `${last.status} ${last.json.error}`);

done();
