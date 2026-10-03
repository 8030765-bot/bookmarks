// Tools drawer: private synced tool data, typing leaderboard, dictionary
// input checks, private folder notes, and tool data following the account.
import { bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("tia", "uma", "vic");
const tools = (who, b) => call(who, "/api/tools", b);

/* ---------- synced tool data ---------- */
let r = await call("guest", "/api/tools?data=1");
ok("guests get no saved tool data", r.json.data === null);
r = await tools("guest", { tool: "notes", value: [] });
ok("guests can't save to an account", r.status === 401);
r = await tools("tia", { tool: "notes", value: [{ id: "n1", title: "Maths", body: "revise fractions", at: "2026-10-03T10:00:00Z" }] });
ok("save notes", r.json.ok === true);
await tools("tia", { tool: "todos", value: [{ id: "t1", text: "Homework", done: false }] });
r = await call("tia", "/api/tools?data=1");
ok("notes and to-dos come back", r.json.data?.notes?.[0]?.body === "revise fractions" && r.json.data?.todos?.[0]?.text === "Homework", JSON.stringify(r.json));
r = await call("uma", "/api/tools?data=1");
ok("other people can't see them", !r.json.data?.notes);
r = await tools("tia", { tool: "hacks", value: 1 });
ok("unknown tools are refused", r.status === 400, r.json.error);
r = await tools("tia", { tool: "countdowns", value: "x".repeat(6000) });
ok("size limit per tool", r.status === 400 && /too much/.test(r.json.error), r.json.error);
r = await tools("tia", { tool: "todos", value: null });
r = await call("tia", "/api/tools?data=1");
ok("clearing a tool removes it", !("todos" in r.json.data));

/* ---------- typing leaderboard ---------- */
r = await tools("guest", { action: "typing", chars: 300, ms: 60000, accuracy: 95 });
ok("guests can't post scores", r.status === 401);
r = await tools("tia", { action: "typing", chars: 300, ms: 5000, accuracy: 99 });
ok("very short tests don't count", r.status === 400, r.json.error);
r = await tools("tia", { action: "typing", chars: 3000, ms: 30000, accuracy: 99 });
ok("impossible speeds are refused", r.status === 400, r.json.error);
r = await tools("tia", { action: "typing", chars: 300, ms: 60000, accuracy: 96 });
ok("a real score counts", r.json.result?.wpm === 60 && r.json.counted && r.json.board[0]?.user === "tia", JSON.stringify(r.json));
r = await tools("tia", { action: "typing", chars: 250, ms: 60000, accuracy: 99 });
ok("a slower go doesn't replace your best", r.json.best.wpm === 60 && r.json.board.find((x) => x.user === "tia").wpm === 60);
r = await tools("uma", { action: "typing", chars: 400, ms: 60000, accuracy: 70 });
ok("low accuracy doesn't make the board", r.json.counted === false && !r.json.board.some((x) => x.user === "uma"));
await tools("uma", { action: "typing", chars: 400, ms: 60000, accuracy: 92 });
r = await call("guest", "/api/tools?typing=1");
ok("board is sorted fastest first", r.json.board.map((x) => x.user).join(",") === "uma,tia", JSON.stringify(r.json.board));

/* ---------- dictionary input checks (no network needed) ---------- */
r = await call("guest", "/api/tools?define=" + encodeURIComponent("<script>"));
ok("dictionary only takes a word", r.status === 400, r.json.error);
r = await call("guest", "/api/tools?define=" + encodeURIComponent("a".repeat(60)));
ok("dictionary refuses long input", r.status === 400);

/* ---------- private folder notes ---------- */
r = await bm("tia", { action: "addFolder", name: "Maths", emoji: "🧮" });
const fid = r.json.folders.find((f) => f.name === "Maths").id;
r = await me("tia", { action: "folderPref", folderId: fid, patch: { note: "  Ask Mr B about Q4  " } });
ok("save a private folder note", r.json.folders?.[fid]?.note === "Ask Mr B about Q4", JSON.stringify(r.json.folders));
r = await me("tia", { action: "folderPref", folderId: fid, patch: { note: "x".repeat(900) } });
ok("folder notes are kept short", r.json.folders[fid].note.length === 500);
r = await me("tia", { action: "folderPref", folderId: fid, patch: { note: "" } });
ok("empty note removes it", !r.json.folders[fid]);

/* ---------- tool data follows the account ---------- */
await tools("vic", { tool: "habits", value: [{ id: "h1", name: "Read", emoji: "📖", days: ["2026-10-01"] }] });
await tools("vic", { action: "typing", chars: 250, ms: 60000, accuracy: 95 });
r = await me("vic", { action: "rename", newName: "victor", password: "secret1" });
ok("rename works", r.status === 200, JSON.stringify(r.json));
r = await call("vic", "/api/tools?data=1");
ok("habits moved with the new name", r.json.data?.habits?.[0]?.name === "Read", JSON.stringify(r.json));
r = await call("guest", "/api/tools?typing=1");
ok("old name is off the typing board", !r.json.board.some((x) => x.user === "vic"));
r = await me("vic", { action: "deleteAccount", password: "secret1" });
ok("delete account", r.status === 200, JSON.stringify(r.json));
await call("vic2", "/api/auth", { action: "signup", username: "victor", password: "secret1" });
r = await call("vic2", "/api/tools?data=1");
ok("deleting the account deleted its tool data", !r.json.data?.habits, JSON.stringify(r.json));

done();
