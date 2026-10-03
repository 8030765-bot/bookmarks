"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityEntry, Contributor, Folder, Link, Poll } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { COLORS, LinkRef, timeAgo } from "./ui";

/* ---------- presence ---------- */
export function usePresence(user: string | null) {
  const [state, setState] = useState<{ count: number; users: string[] }>({ count: 1, users: [] }); // you are here
  useEffect(() => {
    let id = "";
    try {
      id = sessionStorage.getItem("tabId") || "";
      if (!id) { id = Math.random().toString(36).slice(2, 14); sessionStorage.setItem("tabId", id); }
    } catch {
      id = Math.random().toString(36).slice(2, 14);
    }
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const json = await res.json();
        if (typeof json.count === "number") setState({ count: Math.max(1, json.count), users: json.users || [] });
      } catch {}
    };
    beat();
    const t = setInterval(beat, 20000);
    document.addEventListener("visibilitychange", beat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", beat); };
  }, [user]);
  return state;
}

export function OnlinePill({ count, users, onClick }: { count: number; users: string[]; onClick: () => void }) {
  const anon = Math.max(0, count - users.length);
  const title = users.length ? `${users.join(", ")}${anon ? ` + ${anon} guest${anon === 1 ? "" : "s"}` : ""}` : `${count} here now`;
  return (
    <button className="online-pill" onClick={onClick} title={title}>
      <span className="live-dot" /> {Math.max(1, count)} online
    </button>
  );
}

/* ---------- leaderboard / profiles ---------- */
const MEDALS = ["🥇", "🥈", "🥉"];
export function LeaderboardModal({ me, online, onClose }: { me: string | null; online: string[]; onClose: () => void }) {
  const [leaders, setLeaders] = useState<Contributor[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/community", { cache: "no-store" }).then((r) => r.json()).then((j) => setLeaders(j.leaders || [])).catch(() => setLeaders([]));
  }, []);
  const onlineSet = new Set(online.map((u) => u.toLowerCase()));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>🏆 Community</h2>
        <p className="modal-text">Points for adding websites (5), approved suggestions (4), likes received (2), likes given (1) and chatting.</p>
        {online.length > 0 && (
          <div className="online-list">
            <span className="live-dot" /> Online now: {online.map((u) => <span key={u} className="online-name">{u}</span>)}
          </div>
        )}
        {!leaders && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel-row" />)}
        {leaders && leaders.length === 0 && <div className="admin-empty">No accounts yet — sign up to be first on the board!</div>}
        <div className="leader-list">
          {leaders?.map((c, i) => (
            <div key={c.username} className={`leader ${me?.toLowerCase() === c.username.toLowerCase() ? "me" : ""}`}>
              <button className="leader-row" onClick={() => setOpen(open === c.username ? null : c.username)}>
                <span className="rank">{MEDALS[i] || i + 1}</span>
                <span className="avatar">{c.username[0]?.toUpperCase()}{onlineSet.has(c.username.toLowerCase()) && <span className="avatar-dot" />}</span>
                <span className="leader-name">{c.username}{me?.toLowerCase() === c.username.toLowerCase() && <em> (you)</em>}</span>
                <span className="leader-score">{c.score} pts</span>
              </button>
              {open === c.username && (
                <div className="profile">
                  <div><strong>{c.added}</strong><span>websites added</span></div>
                  <div><strong>{c.suggestionsApproved}</strong><span>suggestions approved</span></div>
                  <div><strong>{c.likesReceived}</strong><span>likes received</span></div>
                  <div><strong>{c.likesGiven}</strong><span>likes given</span></div>
                  <div><strong>{c.messages}</strong><span>recent messages</span></div>
                  <div><strong>{c.joined ? timeAgo(c.joined).replace(" ago", "") : "–"}</strong><span>member for</span></div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- what's new ---------- */
export function WhatsNew({ activity, onClose }: { activity: ActivityEntry[]; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="What's new">
        <div className="drawer-head">
          <strong>What&apos;s new</strong>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">
          {activity.length === 0 && <div className="admin-empty">Nothing yet.</div>}
          <div className="timeline">
            {activity.map((a) => (
              <div key={a.id} className="timeline-item">
                <span className={`tl-dot ${a.action}`} />
                <span className="tl-text">{a.detail}</span>
                <span className="tl-time">{timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ---------- spin the wheel ---------- */
const ROW_H = 56;
export function SpinWheel({ refs, folders, onOpen, onClose }: {
  refs: LinkRef[]; folders: Folder[]; onOpen: (f: Folder, l: Link) => void; onClose: () => void;
}) {
  const [folderId, setFolderId] = useState("all");
  const pool = useMemo(() => refs.filter((r) => folderId === "all" || r.folder.id === folderId), [refs, folderId]);
  const [reel, setReel] = useState<LinkRef[]>([]);
  const [offset, setOffset] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<LinkRef | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  function spin() {
    if (!pool.length || spinning) return;
    // build a long reel of random picks; the last one wins
    const items = Array.from({ length: 40 }, () => pool[Math.floor(Math.random() * pool.length)]);
    setWinner(null);
    setReel(items);
    setOffset(0);
    setSpinning(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOffset((items.length - 1) * ROW_H)));
    timer.current = setTimeout(() => { setSpinning(false); setWinner(items[items.length - 1]); }, 3200);
  }

  return (
    <div className="modal-overlay" onClick={() => !spinning && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎰 Spin the wheel</h2>
        <div className="form-group">
          <select value={folderId} onChange={(e) => { setFolderId(e.target.value); setWinner(null); setReel([]); }} disabled={spinning}>
            <option value="all">Any folder ({refs.length})</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name} ({f.links.length})</option>)}
          </select>
        </div>
        <div className="reel-window">
          <div className="reel-marker" />
          <div
            className="reel"
            style={{ transform: `translateY(-${offset}px)`, transition: spinning ? "transform 3.1s cubic-bezier(.12,.75,.15,1)" : "none" }}
          >
            {(reel.length ? reel : pool.slice(0, 1)).map((r, i) => (
              <div key={i} className="reel-item">
                <Favicon url={r.link.url} name={r.link.name} size={20} />
                <span>{r.link.name}</span>
                <em>{r.folder.emoji}</em>
              </div>
            ))}
            {!pool.length && <div className="reel-item muted">This folder is empty</div>}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={spinning}>Close</button>
          {winner && (
            <button className="btn btn-secondary" onClick={() => { onOpen(winner.folder, winner.link); onClose(); }}>
              Open {winner.link.name}
            </button>
          )}
          <button className="btn btn-primary" onClick={spin} disabled={spinning || !pool.length}>
            {spinning ? "Spinning…" : winner ? "Spin again" : "Spin!"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- polls ---------- */
/** Your answers on a poll (anonymous polls keep them on the server, sent only to you). */
export function pollMine(p: Poll, me: string, anon: Record<string, number[]> = {}): number[] {
  const v = p.anonymous ? anon[p.id] : me ? p.votes[me] : undefined;
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}
export function pollCounts(p: Poll): number[] {
  if (p.anonymous) return p.options.map((_, i) => p.counts?.[i] || 0);
  const c = p.options.map(() => 0);
  Object.values(p.votes).forEach((v) => (Array.isArray(v) ? v : [v]).forEach((i) => { if (c[i] !== undefined) c[i]++; }));
  return c;
}
export const pollIsClosed = (p: Poll) => !!p.closed || (!!p.endsAt && Date.parse(p.endsAt) < Date.now());
/** What a vote does, worked out the same way the server does it, so the screen updates instantly. */
export function applyPollVote(p: Poll, me: string, option: number, anon: Record<string, number[]> = {}) {
  const had = pollMine(p, me, anon);
  const next = had.includes(option) ? had.filter((x) => x !== option) : p.multi ? [...had, option].sort((a, b) => a - b) : [option];
  if (p.anonymous) {
    const counts = pollCounts(p);
    had.forEach((i) => { counts[i] = Math.max(0, counts[i] - 1); });
    next.forEach((i) => { counts[i]++; });
    return { poll: { ...p, counts }, mine: next };
  }
  const votes = { ...p.votes };
  if (!next.length) delete votes[me];
  else votes[me] = p.multi ? next : next[0];
  return { poll: { ...p, votes }, mine: next };
}
function endsLabel(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "ended";
  const h = Math.round(ms / 3600_000);
  return h < 1 ? "ends soon" : h < 48 ? `ends in ${h}h` : `ends in ${Math.round(h / 24)}d`;
}

export function PollCards({ polls, user, myAnon = {}, onVote, onNeedLogin }: {
  polls: Poll[]; user: string | null; myAnon?: Record<string, number[]>;
  onVote: (pollId: string, option: number) => void; onNeedLogin: () => void;
}) {
  const visible = polls
    .filter((p) => !pollIsClosed(p) || Date.now() - new Date(p.endsAt || p.createdAt).getTime() < 7 * 86400_000)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
    .slice(0, 3);
  if (!visible.length) return null;
  const me = user?.toLowerCase() || "";
  return (
    <section className="polls">
      {visible.map((p) => {
        const closed = pollIsClosed(p);
        const counts = pollCounts(p);
        const answers = counts.reduce((a, b) => a + b, 0);
        // single-choice: share of voters; multiple-choice: share of everyone who answered
        const voters = p.anonymous ? answers : Object.keys(p.votes).length;
        const total = p.multi && !p.anonymous ? voters : answers;
        const mine = pollMine(p, me, myAnon);
        const showResults = mine.length > 0 || closed || !user;
        return (
          <div key={p.id} className={`poll ${closed ? "closed" : ""} ${p.featured ? "featured" : ""}`}>
            <div className="poll-head">
              <span className="poll-tag">{closed ? "Poll closed" : p.featured ? "⭐ Poll of the week" : "Poll"}</span>
              <span className="poll-meta">
                {voters} {p.anonymous ? "answer" : "vote"}{voters === 1 ? "" : "s"}
                {p.multi && " · pick any"}
                {p.anonymous && " · anonymous"}
                {p.endsAt && !closed && ` · ${endsLabel(p.endsAt)}`}
              </span>
            </div>
            <h3>{p.question}</h3>
            <div className="poll-options">
              {p.options.map((opt, i) => {
                const pct = total ? Math.round((counts[i] / total) * 100) : 0;
                const picked = mine.includes(i);
                return (
                  <button
                    key={i}
                    className={`poll-opt ${picked ? "mine" : ""}`}
                    disabled={closed}
                    aria-pressed={picked}
                    onClick={() => (user ? onVote(p.id, i) : onNeedLogin())}
                  >
                    {showResults && <span className="poll-fill" style={{ width: `${pct}%` }} />}
                    <span className="poll-label">{picked && <Icon name="check" />} {opt}</span>
                    {showResults && <span className="poll-pct">{pct}%</span>}
                  </button>
                );
              })}
            </div>
            {!user && !closed && <div className="poll-foot">Log in to vote</div>}
            {mine.length > 0 && !closed && (
              <div className="poll-foot">
                {p.multi ? "Tap answers to add or remove them" : "Tap your answer again to take your vote back"}
                {p.anonymous && " — nobody can see what you picked"}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ---------- customize: see look.ts and ThemeEditor.tsx ---------- */
export { DEFAULT_LOOK, PALETTES, applyLook } from "./look";
export type { Look, Palette } from "./look";

/* ---------- import browser bookmarks (admin) ---------- */
export function parseBookmarksHtml(html: string): { name: string; links: { name: string; url: string }[] }[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const folders: { name: string; links: { name: string; url: string }[] }[] = [];
  const loose: { name: string; url: string }[] = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const url = a.getAttribute("href") || "";
    if (!/^https?:/i.test(url)) return;
    // nearest enclosing folder heading
    const dl = a.closest("dl");
    const heading = dl?.previousElementSibling?.tagName === "H3" ? dl.previousElementSibling.textContent?.trim() : "";
    const entry = { name: a.textContent?.trim() || url, url };
    if (!heading) { loose.push(entry); return; }
    let f = folders.find((x) => x.name === heading);
    if (!f) { f = { name: heading, links: [] }; folders.push(f); }
    f.links.push(entry);
  });
  if (loose.length) folders.unshift({ name: "Imported", links: loose });
  return folders;
}
