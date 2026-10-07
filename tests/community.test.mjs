// Community: boards, Q&A best answers, shoutouts, challenge, link of the month,
// idea voting + roadmap, events, wiki, flair, thanks, notes, daily question, polls.
import { ADMIN_PW, adm, bm, call, done, me, ok, signup, waitForServer } from "./helpers.mjs";

await waitForServer();
await signup("own", "modz", "ana", "ben", "cal");
await adm("own", { action: "claimOwner", password: ADMIN_PW });
await adm("own", { action: "setRole", username: "modz", role: "mod" });
const board = (who, b) => call(who, "/api/boards", b);
const comm = (who, b) => call(who, "/api/community", b);
const inbox = async (who) => (await me(who)).json.notifications || [];

/* ---------- link requests + Q&A ---------- */
let r = await board("guest", { kind: "requests", title: "Typing game?", text: "free one" });
ok("guests can't post", r.status === 401, r.json.error);
r = await board("ana", { kind: "requests", title: "Typing game?", text: "A free one that works at school" });
ok("post a link request", r.status === 200 && r.json.posts[0]?.title === "Typing game?", JSON.stringify(r.json));
const req = r.json.posts[0];
r = await board("ana", { kind: "nope", text: "x" });
ok("unknown boards are refused", r.status === 400);
r = await board("ana", { kind: "requests", action: "vote", id: req.id });
ok("can't vote for your own post", r.status === 400, r.json.error);
r = await board("ben", { kind: "requests", action: "vote", id: req.id });
ok("others can vote", r.json.posts[0].votes.includes("ben"));
r = await board("ben", { kind: "requests", action: "vote", id: req.id });
ok("voting again takes it back", r.json.posts[0].votes.length === 0);
r = await board("ben", { kind: "requests", action: "reply", id: req.id, url: "typing.example.com", name: "TypeFast", text: "this one" });
const reply = r.json.posts[0].replies[0];
ok("answer a request with a link", reply?.url?.startsWith("https://typing.example.com") && reply?.name === "TypeFast", JSON.stringify(reply));
ok("asker is told about the answer", (await inbox("ana")).some((n) => /ben answered/.test(n.text) && n.link.includes(`post=${req.id}`)));
r = await board("cal", { kind: "requests", action: "accept", id: req.id, replyId: reply.id });
ok("only the asker picks the best answer", r.status === 400, r.json.error);
r = await board("ana", { kind: "requests", action: "accept", id: req.id, replyId: reply.id });
ok("asker picks the best answer", r.json.posts[0].acceptedId === reply.id);
ok("helper is told their answer was picked", (await inbox("ben")).some((n) => /picked as the best/.test(n.text)));
r = await board("ana", { kind: "qa", text: "no title" });
ok("questions need a title", r.status === 400, r.json.error);
r = await board("ana", { kind: "qa", title: "How do I save in Desmos?", text: "**help**" });
const q = r.json.posts[0];
await board("cal", { kind: "qa", action: "reply", id: q.id, text: "Log in first, then Save" });
r = await board("ana", { kind: "qa", action: "vote", id: q.id, replyId: (await call("x", "/api/boards?kind=qa")).json.posts[0].replies[0].id });
ok("vote on an answer", r.json.posts[0].replies[0].votes.includes("ana"));

/* ---------- deleting: your own, or a moderator ---------- */
r = await board("cal", { kind: "qa", action: "delete", id: q.id });
ok("can't delete someone else's post", r.status === 400, r.json.error);
r = await board("modz", { kind: "qa", action: "delete", id: q.id });
ok("moderators can delete any post", r.status === 200 && !r.json.posts.some((p) => p.id === q.id));

/* ---------- shoutouts + guestbook ---------- */
r = await board("ana", { kind: "shoutouts", to: "nobody", text: "thanks" });
ok("shoutouts need a real person", r.status === 400, r.json.error);
r = await board("ana", { kind: "shoutouts", to: "ana", text: "me" });
ok("can't shout out yourself", r.status === 400);
r = await board("ana", { kind: "shoutouts", to: "@ben", text: "for the typing site" });
ok("shoutout posted", r.json.posts[0]?.to === "ben");
ok("person shouted out is told", (await inbox("ben")).some((n) => /shoutout/.test(n.text)));
r = await board("cal", { kind: "guestbook", emoji: "🎉", text: "hi all" });
ok("sign the guestbook", r.json.posts[0]?.emoji === "🎉");

/* ---------- muted people can't post ---------- */
await adm("modz", { action: "ban", username: "cal" });
r = await board("cal", { kind: "tips", title: "x", text: "y" });
ok("muted people can't post", r.status === 403, r.json.error);
await adm("modz", { action: "unban", username: "cal" });

/* ---------- challenge + link of the month ---------- */
r = await board("ana", { kind: "challenge", url: "a.example.com" });
ok("no entries without a running challenge", r.status === 400, r.json.error);
r = await bm("own", { action: "setSettings", settings: { challenge: { title: "Best maths site", round: "r1" } } });
ok("admin starts a challenge", r.json.settings?.challenge?.title === "Best maths site");
r = await board("ana", { kind: "challenge", url: "maths.example.com", round: "made-up" });
ok("entries go in the running round", r.json.posts[0]?.round === "r1", r.json.posts?.[0]?.round);
for (const u of ["b", "c", "d"]) await board("ben", { kind: "lotm", url: `${u}.example.com` });
r = await board("ben", { kind: "lotm", url: "e.example.com" });
ok("3 nominations each per month", r.status === 400, r.json.error);
r = await bm("own", { action: "setSettings", settings: { challenge: null } });
ok("end the challenge", !r.json.settings?.challenge);

/* ---------- ideas: vote, comment, roadmap ---------- */
await call("ana", "/api/suggestions", { kind: "other", note: "Dark mode for the wiki" });
r = await call("guest", "/api/suggestions?public=1");
const idea = r.json.suggestions.find((s) => s.note === "Dark mode for the wiki");
ok("ideas are public", !!idea && !("resolvedNote" in idea));
r = await call("ana", "/api/suggestions", { action: "vote", id: idea.id });
ok("can't upvote your own idea", r.status === 400);
r = await call("ben", "/api/suggestions", { action: "vote", id: idea.id });
ok("upvote an idea", r.json.suggestions.find((s) => s.id === idea.id).votes.includes("ben"));
r = await call("ben", "/api/suggestions", { action: "comment", id: idea.id, text: "yes please" });
ok("comment on an idea", r.json.suggestions.find((s) => s.id === idea.id).comments[0].text === "yes please");
ok("idea owner hears about the comment", (await inbox("ana")).some((n) => /commented on your suggestion/.test(n.text)));
r = await adm("ben", { action: "setStage", id: idea.id, stage: "planned" });
ok("members can't set the roadmap stage", r.status === 403);
r = await adm("modz", { action: "setStage", id: idea.id, stage: "planned" });
ok("moderator moves an idea to planned", r.json.suggestions.find((s) => s.id === idea.id).stage === "planned");
r = await bm("own", { action: "addFolder", name: "Maths", emoji: "🧮" });
const fid = r.json.folders.find((f) => f.name === "Maths").id;
r = await call("cal", "/api/suggestions", { kind: "newFolder", name: "Typing", emoji: "⌨️", description: "Typing practice" });
ok("suggest a new folder", r.status === 200 && r.json.suggestions.some((s) => s.kind === "newFolder"), JSON.stringify(r.json));

/* ---------- events ---------- */
r = await call("ana", "/api/events", { title: "Game jam", date: new Date(Date.now() + 86400e3).toISOString() });
ok("members can't add events", r.status === 403);
r = await call("modz", "/api/events", { title: "Game jam", date: new Date(Date.now() + 86400e3).toISOString() });
ok("moderators add events", r.json.events?.[0]?.title === "Game jam");
r = await call("guest", "/api/events");
ok("everyone sees events", r.json.events.length === 1);

/* ---------- wiki ---------- */
r = await call("guest", "/api/wiki", { title: "Getting started", body: "x" });
ok("guests can't edit the wiki", r.status === 401);
r = await call("ana", "/api/wiki", { title: "Getting started", body: "# Hi\nWelcome" });
ok("write a wiki page", r.json.page?.slug === "getting-started");
r = await call("ben", "/api/wiki", { slug: "getting-started", title: "Getting started", body: "# Hi\nWelcome!!" });
ok("edits keep history", r.json.page.history.length === 1 && r.json.page.history[0].by === "ana");
r = await call("modz", "/api/wiki", { slug: "getting-started", title: "Getting started", body: "locked now", locked: true });
ok("moderator locks a page", r.json.page.locked === true);
r = await call("ana", "/api/wiki", { slug: "getting-started", title: "Getting started", body: "vandal" });
ok("locked pages refuse member edits", r.status === 400, r.json.error);
r = await call("guest", "/api/wiki?slug=getting-started");
ok("read a page", r.json.page.body === "locked now");
r = await call("guest", "/api/wiki?slug=nope");
ok("missing page is a 404", r.status === 404);
r = await call("ana", "/api/wiki", { action: "delete", slug: "getting-started" });
ok("members can't delete pages", r.status === 403);

/* ---------- flair, thanks, community notes ---------- */
r = await adm("modz", { action: "setFlair", username: "ben", flair: "Link hunter" });
ok("moderators can't give flair", r.status === 403);
r = await adm("own", { action: "setFlair", username: "ben", flair: "Link hunter" });
ok("admin gives flair", r.json.flair?.ben === "Link hunter");
r = await bm("ana", { action: "addLink", folderId: fid, name: "Desmos", url: "desmos.example.com" });
const link = r.json.folders.find((f) => f.id === fid).links[0];
r = await comm("ana", { action: "thank", linkId: link.id });
ok("can't thank yourself", r.status === 400, r.json.error);
r = await comm("ben", { action: "thank", linkId: link.id });
ok("say thanks", r.json.count === 1);
await comm("ben", { action: "thank", linkId: link.id });
ok("adder is told (once)", (await inbox("ana")).filter((n) => /said thanks/.test(n.text)).length === 1);
r = await comm("ben", { action: "note", linkId: link.id, text: "Needs a free account" });
ok("suggest a note", r.json.ok === true);
r = await adm("modz", { action: "overview" });
const pending = r.json.notes?.[0];
ok("note waits for a moderator", pending?.text === "Needs a free account" && r.json.flair?.ben === "Link hunter");
r = await adm("modz", { action: "approveNote", id: pending.id });
const shown = r.json.data.folders.find((f) => f.id === fid).links[0].communityNotes;
ok("approved note shows on the link", shown?.[0]?.text === "Needs a free account" && shown[0].by === "ben");
r = await adm("modz", { action: "removeNote", linkId: link.id, index: 0 });
ok("moderator removes a note", !r.json.data.folders.find((f) => f.id === fid).links[0].communityNotes);

/* ---------- community summary + daily question ---------- */
r = await comm("ana", { action: "wyr", choice: 1 });
ok("answer would-you-rather", r.json.wyr?.b === 1 && r.json.wyr.mine === 1);
await comm("ben", { action: "wyr", choice: 0 });
r = await call("ana", "/api/community");
ok("summary has goals, flair, thanks and today's split", r.json.goals?.links?.now >= 1 && r.json.flair?.ben && r.json.thanks?.[link.id] === 1 && r.json.wyr?.a === 1 && r.json.wyr?.b === 1);
ok("you only see your own answer", r.json.wyr.mine === 1 && !("ben" in (r.json.wyr || {})));
ok("helpers are counted", r.json.helpers.some((h) => h.username === "ben" && h.accepted === 1));
ok("new members listed", r.json.newMembers.includes("ana"));
ok("events in the summary", r.json.events.some((e) => e.title === "Game jam"));

/* ---------- polls: multi, anonymous, closing date, featured ---------- */
r = await bm("own", { action: "createPoll", question: "Pick any", options: ["A", "B", "C"], multi: true, featured: true, password: ADMIN_PW });
const multi = r.json.polls[0];
ok("multi-choice poll of the week", multi.multi && multi.featured);
await bm("ana", { action: "votePoll", pollId: multi.id, option: 0 });
r = await bm("ana", { action: "votePoll", pollId: multi.id, option: 2 });
ok("pick more than one", JSON.stringify(r.json.polls.find((p) => p.id === multi.id).votes.ana) === "[0,2]");
r = await bm("ana", { action: "votePoll", pollId: multi.id, option: 0 });
ok("tap again to drop one", JSON.stringify(r.json.polls.find((p) => p.id === multi.id).votes.ana) === "[2]");
r = await bm("own", { action: "createPoll", question: "Secret", options: ["Yes", "No"], anonymous: true, featured: true, password: ADMIN_PW });
const anon = r.json.polls[0];
ok("only one poll of the week", r.json.polls.filter((p) => p.featured).length === 1 && r.json.polls[0].featured);
await bm("ana", { action: "votePoll", pollId: anon.id, option: 0 });
r = await bm("ben", { action: "votePoll", pollId: anon.id, option: 0 });
let p = r.json.polls.find((x) => x.id === anon.id);
ok("anonymous poll shows counts, not names", JSON.stringify(p.counts) === "[2,0]" && Object.keys(p.votes).length === 0, JSON.stringify(p));
r = await bm("ben", { action: "votePoll", pollId: anon.id, option: 1 });
p = r.json.polls.find((x) => x.id === anon.id);
ok("changing an anonymous answer moves the count", JSON.stringify(p.counts) === "[1,1]");
r = await call("ben", "/api/community");
ok("you can see your own anonymous answer", JSON.stringify(r.json.myPolls?.[anon.id]) === "[1]");
r = await bm("own", { action: "createPoll", question: "Ended", options: ["X", "Y"], endsAt: new Date(Date.now() - 1000).toISOString(), password: ADMIN_PW });
r = await bm("ana", { action: "votePoll", pollId: r.json.polls[0].id, option: 0 });
ok("polls past their closing date refuse votes", r.status === 400, r.json.error);

done();
