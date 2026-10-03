"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarksData, Contributor, Suggestion } from "@/lib/types";
import { Icon } from "../components/Icon";
import Favicon from "../components/Favicon";
import { Board, BoardKind, useBoard } from "../components/Boards";
import { UserChip, setFlairMap } from "../components/People";
import { CommunityInfo } from "../components/Today";
import { useOnRevChange, useSyncLoop } from "../components/sync";
import { hostOf, safeHref, timeAgo } from "../components/ui";
import { EasterEgg } from "../components/Fun";

type Tab = BoardKind | "roadmap" | "events" | "fame" | "recap";
const TABS: { id: Tab; label: string }[] = [
  { id: "requests", label: "🔎 Link requests" },
  { id: "qa", label: "❓ Q&A" },
  { id: "tips", label: "💡 Tips" },
  { id: "challenge", label: "🏁 Challenge" },
  { id: "lotm", label: "🏆 Link of the month" },
  { id: "roadmap", label: "🗺️ Ideas & roadmap" },
  { id: "shoutouts", label: "👏 Shoutouts" },
  { id: "guestbook", label: "📖 Guestbook" },
  { id: "events", label: "📅 Events" },
  { id: "fame", label: "🌟 Hall of fame" },
  { id: "recap", label: "📊 Monthly recap" },
];

export default function CommunityPage() {
  return (
    <Suspense fallback={<div className="app"><div className="skeleton skel-row" /></div>}>
      <Community />
    </Suspense>
  );
}

function Community() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "requests") as Tab;
  const focus = params.get("post");
  const [me, setMe] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [data, setData] = useState<BookmarksData | null>(null);
  const [info, setInfo] = useState<(CommunityInfo & { leaders: Contributor[] }) | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState("");
  useSyncLoop(me);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg((x) => (x === m ? "" : x)), 3000);
  }, []);
  const loadInfo = useCallback(() => {
    fetch("/api/community", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.goals) { setInfo(j); setFlairMap(j.flair || {}); } }).catch(() => {});
  }, []);
  const loadData = useCallback(() => {
    fetch("/api/bookmarks", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.folders) setData(j); }).catch(() => {});
  }, []);
  useEffect(() => {
    document.title = "Community · Theo's Bookmarks";
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((j) => { setMe(j.user || null); setRole(j.role || null); }).catch(() => {});
    fetch("/api/people", { cache: "no-store" }).then((r) => r.json()).then((j) => setUsers((j.people || []).map((p: { username: string }) => p.username))).catch(() => {});
    loadInfo();
    loadData();
  }, [loadInfo, loadData]);
  useOnRevChange("suggestions", loadInfo);
  useOnRevChange("bookmarks", loadData);

  const go = (t: Tab) => router.replace(`/community?tab=${t}`, { scroll: false });
  const challenge = data?.settings?.challenge;
  const challengeOpen = !!challenge && (!challenge.endsAt || Date.parse(challenge.endsAt) > Date.now());
  const month = new Date().toISOString().slice(0, 7);

  return (
    <div className="app community-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/wiki"><Icon name="note" /> Wiki</Link>
        <Link className="btn btn-secondary btn-sm" href="/people"><Icon name="users" /> People</Link>
      </div>
      <header className="hero">
        <h1>Community <EasterEgg id="community" /></h1>
        <p>Ask for links, answer questions, share tips and vote on what comes next.</p>
        {info && (
          <div className="goal-row">
            {(["links", "members"] as const).map((k) => (
              <div key={k} className="goal">
                <span>{info.goals[k].now} / {info.goals[k].goal} {k === "links" ? "websites" : "members"}</span>
                <span className="goal-bar"><span style={{ width: `${Math.min(100, (info.goals[k].now / info.goals[k].goal) * 100)}%` }} /></span>
              </div>
            ))}
          </div>
        )}
      </header>
      {info && info.newMembers.length > 0 && (
        <div className="welcome-row">
          👋 Say hi to our newest members: {info.newMembers.map((u, i) => <span key={u}>{i > 0 && ", "}<UserChip username={u} /></span>)}
        </div>
      )}

      <nav className="cm-tabs" aria-label="Community sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}>{t.label}</button>
        ))}
      </nav>

      <main id="main" className="cm-body">
        {tab === "challenge" && (
          <>
            {challenge ? (
              <div className="cm-banner">
                <strong>{challenge.title}</strong>
                {challenge.text && <p>{challenge.text}</p>}
                {challenge.endsAt && <p className="muted-inline">Ends {new Date(challenge.endsAt).toLocaleString()}</p>}
                {!challengeOpen && <p className="muted-inline">This challenge has ended — here are the entries.</p>}
              </div>
            ) : (
              <div className="empty-state small"><p>No challenge running right now. Check back soon!</p></div>
            )}
            {challenge && <Board kind="challenge" me={challengeOpen ? me : null} staff={!!role} round={challenge.round} focusId={focus} toast={toast} />}
          </>
        )}
        {tab === "lotm" && (
          <>
            <LastMonthWinner />
            <div className="cm-banner"><strong>Nominate this month’s best link</strong><p>Everyone gets 3 nominations a month. The one with the most votes wins.</p></div>
            <Board kind="lotm" me={me} staff={!!role} round={month} focusId={focus} toast={toast} />
          </>
        )}
        {(["requests", "qa", "tips", "shoutouts", "guestbook"] as Tab[]).includes(tab) && (
          <Board key={tab} kind={tab as BoardKind} me={me} staff={!!role} focusId={focus} toast={toast} users={users} />
        )}
        {tab === "roadmap" && <Roadmap me={me} toast={toast} />}
        {tab === "events" && <Events events={info?.events} />}
        {tab === "fame" && <HallOfFame info={info} data={data} />}
        {tab === "recap" && <Recap data={data} info={info} />}
      </main>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

/* ---------- link of the month: last month's winner ---------- */
function LastMonthWinner() {
  const { posts } = useBoard("lotm");
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const last = d.toISOString().slice(0, 7);
  const winner = (posts || []).filter((p) => p.round === last).sort((a, b) => b.votes.length - a.votes.length)[0];
  if (!winner || !winner.votes.length) return null;
  return (
    <div className="cm-banner winner">
      <span className="muted-inline">🏆 Last month’s winner</span>
      <a className="post-link" href={safeHref(winner.url || "")} target="_blank" rel="noopener noreferrer">
        <Favicon url={winner.url || ""} name={winner.title || ""} size={20} /> <strong>{winner.title || hostOf(winner.url || "")}</strong>
      </a>
      <span className="muted-inline">nominated by {winner.user} · {winner.votes.length} votes</span>
    </div>
  );
}

/* ---------- ideas & roadmap ---------- */
function Roadmap({ me, toast }: { me: string | null; toast: (m: string) => void }) {
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [idea, setIdea] = useState("");
  const load = useCallback(() => {
    fetch("/api/suggestions?public=1", { cache: "no-store" }).then((r) => r.json()).then((j) => setList(j.suggestions || [])).catch(() => setList([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useOnRevChange("suggestions", load);
  async function post(body: Record<string, unknown>) {
    if (!me) { toast("Log in to join in"); return false; }
    const res = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error || "Something went wrong"); return false; }
    if (body.action) setList(j.suggestions); else load();
    return true;
  }
  const meKey = me?.toLowerCase() || "";
  const ideas = (list || []).filter((s) => s.kind === "other");
  const cols: { id: string; label: string; items: Suggestion[] }[] = [
    { id: "ideas", label: "💭 Ideas", items: ideas.filter((s) => !s.stage && s.status === "pending") },
    { id: "planned", label: "📌 Planned", items: ideas.filter((s) => s.stage === "planned") },
    { id: "progress", label: "🔨 In progress", items: ideas.filter((s) => s.stage === "in progress") },
    { id: "done", label: "✅ Done", items: ideas.filter((s) => s.stage === "done" || (!s.stage && s.status === "approved")) },
  ];
  const linkSuggestions = (list || []).filter((s) => s.kind !== "other" && s.status === "pending");
  return (
    <>
      <form className="board-form" onSubmit={async (e) => { e.preventDefault(); if (idea.trim() && (await post({ kind: "other", note: idea }))) { setIdea(""); toast("Idea posted — others can vote on it"); } }}>
        <div className="board-form-row">
          <input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="An idea for the site…" maxLength={500} />
          <button className="btn btn-primary btn-sm" disabled={!me || !idea.trim()}>Post idea</button>
        </div>
      </form>
      {!list && <div className="skeleton skel-row" />}
      <div className="roadmap">
        {cols.map((c) => (
          <section key={c.id} className="rm-col">
            <h3>{c.label} <span className="muted-inline">{c.items.length}</span></h3>
            {[...c.items].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0)).map((s) => {
              const voted = !!s.votes?.includes(meKey);
              return (
                <div key={s.id} className="rm-card">
                  <div className="rm-top">
                    <button className={`vote-btn ${voted ? "on" : ""}`} disabled={s.user.toLowerCase() === meKey} onClick={() => post({ action: "vote", id: s.id })} aria-pressed={voted}>
                      <Icon name="up" /> <span>{s.votes?.length || 0}</span>
                    </button>
                    <p>{s.note}</p>
                  </div>
                  <div className="post-meta">
                    <UserChip username={s.user} /><span className="muted-inline">{timeAgo(s.createdAt)}</span>
                    <button className="link-btn" onClick={() => setOpen(open === s.id ? null : s.id)}>💬 {s.comments?.length || 0}</button>
                  </div>
                  {open === s.id && (
                    <div className="replies">
                      {(s.comments || []).map((c) => (
                        <div key={c.id} className="reply"><div className="post-meta"><UserChip username={c.user} /><span className="muted-inline">{timeAgo(c.at)}</span></div><p className="post-text">{c.text}</p></div>
                      ))}
                      <form className="board-form-row" onSubmit={async (e) => { e.preventDefault(); if (await post({ action: "comment", id: s.id, text: comment })) setComment(""); }}>
                        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" maxLength={500} />
                        <button className="btn btn-secondary btn-sm" disabled={!comment.trim()}>Send</button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {linkSuggestions.length > 0 && (
        <>
          <h3 className="admin-h">Website suggestions waiting for a check</h3>
          {linkSuggestions.map((s) => (
            <div key={s.id} className="rm-card row">
              <button className={`vote-btn ${s.votes?.includes(meKey) ? "on" : ""}`} disabled={s.user.toLowerCase() === meKey} onClick={() => post({ action: "vote", id: s.id })}>
                <Icon name="up" /> <span>{s.votes?.length || 0}</span>
              </button>
              <span>{s.kind === "addLink" ? `Add “${s.name}”` : s.kind === "removeLink" ? `Remove “${s.linkName}”` : s.kind === "newFolder" ? `New folder “${s.name}”` : `Change “${s.linkName || s.name}”`}</span>
              <span className="muted-inline">by {s.user}</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ---------- events ---------- */
function Events({ events }: { events?: CommunityInfo["events"] }) {
  if (!events) return <div className="skeleton skel-row" />;
  if (!events.length) return <div className="empty-state small"><p>Nothing on the calendar right now.</p></div>;
  return (
    <div className="events">
      {events.map((e) => {
        const d = new Date(e.date);
        const live = Date.parse(e.date) <= Date.now() && (!e.endDate || Date.parse(e.endDate) > Date.now());
        return (
          <div key={e.id} className={`event ${live ? "live" : ""}`}>
            <div className="event-date"><span>{d.toLocaleDateString(undefined, { month: "short" })}</span><strong>{d.getDate()}</strong></div>
            <div>
              <strong>{e.title}</strong> {live && <span className="pill approved">happening now</span>}
              <div className="muted-inline">{d.toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit" })}{e.endDate && ` – ${new Date(e.endDate).toLocaleDateString()}`}</div>
              {e.description && <p>{e.description}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- hall of fame ---------- */
const MEDALS = ["🥇", "🥈", "🥉"];
function HallOfFame({ info, data }: { info: (CommunityInfo & { leaders: Contributor[] }) | null; data: BookmarksData | null }) {
  const refs = useMemo(() => (data?.folders || []).flatMap((f) => f.links.map((l) => ({ f, l }))), [data]);
  if (!info || !data) return <div className="skeleton skel-row" />;
  const mostLiked = [...refs].sort((a, b) => (b.l.likes?.length || 0) - (a.l.likes?.length || 0)).filter((r) => r.l.likes?.length).slice(0, 5);
  const mostThanked = [...refs].filter((r) => info.thanks[r.l.id]).sort((a, b) => info.thanks[b.l.id] - info.thanks[a.l.id]).slice(0, 5);
  const mostVisited = [...refs].filter((r) => (r.l.clicks || 0) > 0).sort((a, b) => (b.l.clicks || 0) - (a.l.clicks || 0)).slice(0, 5);
  const linkList = (rows: typeof refs, n: (r: (typeof refs)[number]) => string) => rows.map((r, i) => (
    <a key={r.l.id} className="fame-row" href={`/#link-${r.l.id}`}>
      <span className="fame-rank">{MEDALS[i] || i + 1}</span>
      <Favicon url={r.l.url} name={r.l.name} size={18} /> <span className="fame-name">{r.l.name}</span>
      <span className="muted-inline">{n(r)}</span>
    </a>
  ));
  return (
    <div className="fame-grid">
      <section className="fame-card">
        <h3>Top contributors</h3>
        {info.leaders.slice(0, 10).map((c, i) => (
          <div key={c.username} className="fame-row">
            <span className="fame-rank">{MEDALS[i] || i + 1}</span>
            <UserChip username={c.username} />
            <span className="muted-inline">{c.score} pts · {c.added} added</span>
          </div>
        ))}
      </section>
      <section className="fame-card">
        <h3>Most helpful</h3>
        {info.helpers.length === 0 && <p className="muted-inline">Answer questions in Q&amp;A to show up here.</p>}
        {info.helpers.map((h, i) => (
          <div key={h.username} className="fame-row">
            <span className="fame-rank">{MEDALS[i] || i + 1}</span>
            <UserChip username={h.username} />
            <span className="muted-inline">{h.accepted} best · {h.answers} answers</span>
          </div>
        ))}
      </section>
      <section className="fame-card"><h3>Most liked websites</h3>{mostLiked.length ? linkList(mostLiked, (r) => `❤️ ${r.l.likes?.length}`) : <p className="muted-inline">Like a link to start this list.</p>}</section>
      <section className="fame-card"><h3>Most thanked</h3>{mostThanked.length ? linkList(mostThanked, (r) => `🙏 ${info.thanks[r.l.id]}`) : <p className="muted-inline">Say thanks on a link to start this list.</p>}</section>
      <section className="fame-card"><h3>Most visited</h3>{mostVisited.length ? linkList(mostVisited, (r) => `${r.l.clicks} visits`) : <p className="muted-inline">No visits counted yet.</p>}</section>
    </div>
  );
}

/* ---------- this month's recap ---------- */
function Recap({ data, info }: { data: BookmarksData | null; info: (CommunityInfo & { leaders: Contributor[] }) | null }) {
  const [offset, setOffset] = useState(0);
  if (!data || !info) return <div className="skeleton skel-row" />;
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const inMonth = (iso?: string) => {
    if (!iso) return false;
    const x = new Date(iso);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}` === key;
  };
  const added = data.folders.flatMap((f) => f.links.filter((l) => inMonth(l.createdAt)).map((l) => ({ f, l })));
  const byPerson = new Map<string, number>();
  added.forEach(({ l }) => { if (l.addedBy) byPerson.set(l.addedBy, (byPerson.get(l.addedBy) || 0) + 1); });
  const topAdders = Array.from(byPerson.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const byFolder = new Map<string, number>();
  added.forEach(({ f }) => byFolder.set(`${f.emoji} ${f.name}`, (byFolder.get(`${f.emoji} ${f.name}`) || 0) + 1));
  const busiest = Array.from(byFolder.entries()).sort((a, b) => b[1] - a[1])[0];
  const activity = (data.activity || []).filter((a) => inMonth(a.at));
  const newFolders = data.folders.filter((f) => inMonth(f.createdAt));
  return (
    <div className="recap">
      <div className="recap-head">
        <button className="btn-icon" onClick={() => setOffset(offset + 1)} title="Earlier month" aria-label="Earlier month"><Icon name="up" /></button>
        <h2>{d.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <button className="btn-icon" disabled={offset === 0} onClick={() => setOffset(offset - 1)} title="Later month" aria-label="Later month"><Icon name="down" /></button>
      </div>
      <div className="recap-stats">
        <div><strong>{added.length}</strong><span>websites added</span></div>
        <div><strong>{newFolders.length}</strong><span>new folders</span></div>
        <div><strong>{activity.length}</strong><span>changes</span></div>
        <div><strong>{offset === 0 ? info.goals.members.now : "—"}</strong><span>members</span></div>
      </div>
      {topAdders.length > 0 && (
        <section className="fame-card">
          <h3>Who added the most</h3>
          {topAdders.map(([u, n], i) => <div key={u} className="fame-row"><span className="fame-rank">{MEDALS[i]}</span><UserChip username={u} /><span className="muted-inline">{n} websites</span></div>)}
        </section>
      )}
      {busiest && <p className="recap-line">Busiest folder: <strong>{busiest[0]}</strong> with {busiest[1]} new websites.</p>}
      {added.length > 0 && (
        <section className="fame-card">
          <h3>New this month</h3>
          {added.slice(-12).reverse().map(({ f, l }) => (
            <a key={l.id} className="fame-row" href={`/#link-${l.id}`}><Favicon url={l.url} name={l.name} size={16} /> <span className="fame-name">{l.name}</span><span className="muted-inline">{f.emoji} {f.name}</span></a>
          ))}
        </section>
      )}
      {added.length === 0 && <div className="empty-state small"><p>Nothing was added this month.</p></div>}
    </div>
  );
}
