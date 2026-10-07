"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import Markdown from "./Markdown";
import { UserChip } from "./People";
import { useOnRevChange } from "./sync";
import { hostOf, safeHref, timeAgo } from "./ui";

export type BoardKind = "requests" | "qa" | "tips" | "guestbook" | "shoutouts" | "challenge" | "lotm";
export interface BoardReply { id: string; user: string; text: string; url?: string; name?: string; at: string; votes: string[] }
export interface BoardPost {
  id: string; kind: BoardKind; user: string; title?: string; text: string; url?: string; to?: string; emoji?: string;
  at: string; votes: string[]; replies: BoardReply[]; acceptedId?: string; round?: string;
}

interface BoardConfig {
  empty: string;
  /** what the "new post" form asks for */
  fields: ("title" | "text" | "url" | "to" | "emoji")[];
  titleLabel?: string;
  textLabel?: string;
  button: string;
  replies?: "text" | "link";
  accept?: boolean;
  vote: string;
}
export const BOARDS: Record<BoardKind, BoardConfig> = {
  requests: {
    empty: "No requests yet. Looking for a website that does something? Ask here.",
    fields: ["title", "text"], titleLabel: "What are you looking for?", textLabel: "Any details (subject, free, works on school wifi…)",
    button: "Ask for a link", replies: "link", accept: true, vote: "Me too",
  },
  qa: {
    empty: "No questions yet. Stuck on something? Ask here.",
    fields: ["title", "text"], titleLabel: "Your question", textLabel: "More detail (optional)",
    button: "Ask", replies: "text", accept: true, vote: "Useful",
  },
  tips: {
    empty: "No tips yet. Know a trick for one of the sites? Share it.",
    fields: ["title", "text"], titleLabel: "Tip headline", textLabel: "The tip",
    button: "Share tip", replies: "text", vote: "Helpful",
  },
  shoutouts: {
    empty: "No shoutouts yet. Someone helped you? Say so!",
    fields: ["to", "text"], textLabel: "What for?", button: "Send shoutout", vote: "👏",
  },
  guestbook: {
    empty: "The guestbook is empty — be the first to sign it.",
    fields: ["emoji", "text"], textLabel: "Say hi", button: "Sign the guestbook", vote: "❤️",
  },
  challenge: {
    empty: "No entries yet — be the first.",
    fields: ["url", "title", "text"], titleLabel: "Name (optional)", textLabel: "Why this one?", button: "Enter", vote: "Vote",
  },
  lotm: {
    empty: "No nominations this month yet.",
    fields: ["url", "title", "text"], titleLabel: "Name (optional)", textLabel: "Why it deserves to win", button: "Nominate", vote: "Vote",
  },
};

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json.posts as BoardPost[];
}

export function useBoard(kind: BoardKind) {
  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const load = useCallback(() => {
    fetch(`/api/boards?kind=${kind}`, { cache: "no-store" }).then((r) => r.json()).then((j) => setPosts(j.posts || [])).catch(() => setPosts([]));
  }, [kind]);
  useEffect(() => { setPosts(null); load(); }, [load]);
  useOnRevChange("suggestions", load);
  return { posts, setPosts, load };
}

/** One community board: a form to post, then the posts with votes, answers and "best answer". */
export function Board({ kind, me, staff, round, focusId, toast, users = [] }: {
  kind: BoardKind; me: string | null; staff: boolean; round?: string; focusId?: string | null;
  toast: (m: string) => void; users?: string[];
}) {
  const cfg = BOARDS[kind];
  const { posts, setPosts } = useBoard(kind);
  const [form, setForm] = useState({ title: "", text: "", url: "", to: "", emoji: "👋" });
  const [sort, setSort] = useState<"top" | "new" | "open">(kind === "guestbook" || kind === "shoutouts" ? "new" : "top");
  const [busy, setBusy] = useState(false);
  const meKey = me?.toLowerCase() || "";

  const list = useMemo(() => {
    let l = (posts || []).filter((p) => !round || p.round === round);
    if (sort === "open") l = l.filter((p) => !p.acceptedId);
    return [...l].sort((a, b) => (sort === "top" ? b.votes.length - a.votes.length || b.at.localeCompare(a.at) : b.at.localeCompare(a.at)));
  }, [posts, sort, round]);

  useEffect(() => {
    if (!focusId || !posts) return;
    const el = document.getElementById(`post-${focusId}`);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
  }, [focusId, posts]);

  async function run(body: Record<string, unknown>, ok?: string) {
    if (!me) { toast("Log in to join in"); return false; }
    setBusy(true);
    try {
      setPosts(await call({ kind, ...body }));
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="board">
      <form
        className="board-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ action: "create", ...form, round }, "Posted!")) setForm({ title: "", text: "", url: "", to: "", emoji: form.emoji });
        }}
      >
        {cfg.fields.includes("to") && (
          <>
            <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="Who's it for? (username)" list="board-users" maxLength={20} />
            <datalist id="board-users">{users.filter((u) => u.toLowerCase() !== meKey).map((u) => <option key={u} value={u} />)}</datalist>
          </>
        )}
        {cfg.fields.includes("url") && <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" inputMode="url" />}
        {cfg.fields.includes("title") && <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={cfg.titleLabel} maxLength={120} />}
        <div className="board-form-row">
          {cfg.fields.includes("emoji") && (
            <select value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} aria-label="Emoji" className="emoji-in">
              {["👋", "😀", "🎉", "🔥", "💜", "⭐", "🚀", "🎮", "📚", "🌈"].map((x) => <option key={x}>{x}</option>)}
            </select>
          )}
          <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={cfg.textLabel} maxLength={kind === "qa" ? 2000 : 500} rows={kind === "qa" || kind === "tips" ? 3 : 1} />
        </div>
        <div className="board-form-foot">
          {!me && <span className="muted-inline">Log in to post</span>}
          <button className="btn btn-primary btn-sm" disabled={busy || !me}>{cfg.button}</button>
        </div>
      </form>

      <div className="seg small">
        <button className={sort === "top" ? "on" : ""} onClick={() => setSort("top")}>Top</button>
        <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>Newest</button>
        {cfg.accept && <button className={sort === "open" ? "on" : ""} onClick={() => setSort("open")}>Unanswered</button>}
      </div>

      {!posts && [0, 1].map((i) => <div key={i} className="skeleton skel-row" />)}
      {posts && list.length === 0 && <div className="empty-state small"><p>{cfg.empty}</p></div>}
      {list.map((p) => (
        <PostCard key={p.id} p={p} cfg={cfg} me={meKey} staff={staff} busy={busy} run={run} />
      ))}
    </div>
  );
}

function PostCard({ p, cfg, me, staff, busy, run }: {
  p: BoardPost; cfg: BoardConfig; me: string; staff: boolean; busy: boolean;
  run: (body: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState({ text: "", url: "", name: "" });
  const mine = p.user.toLowerCase() === me;
  const voted = p.votes.includes(me);
  const replies = [...p.replies].sort((a, b) => Number(b.id === p.acceptedId) - Number(a.id === p.acceptedId) || b.votes.length - a.votes.length);
  return (
    <article id={`post-${p.id}`} className={`post ${p.acceptedId ? "solved" : ""}`}>
      <div className="post-vote">
        <button className={`vote-btn ${voted ? "on" : ""}`} disabled={busy || (mine && p.kind !== "guestbook")} onClick={() => run({ action: "vote", id: p.id })} title={cfg.vote} aria-pressed={voted}>
          <Icon name="up" /> <span>{p.votes.length}</span>
        </button>
      </div>
      <div className="post-main">
        <div className="post-meta">
          {p.emoji && <span className="post-emoji">{p.emoji}</span>}
          <UserChip username={p.user} face />
          {p.to && <> → <UserChip username={p.to} /></>}
          <span className="muted-inline">{timeAgo(p.at)}</span>
          {p.acceptedId && <span className="pill approved">✓ solved</span>}
        </div>
        {p.url && (
          <a className="post-link" href={safeHref(p.url)} target="_blank" rel="noopener noreferrer">
            <Favicon url={p.url} name={p.title || p.url} size={18} /> <strong>{p.title || hostOf(p.url)}</strong> <span className="muted-inline">{hostOf(p.url)}</span>
          </a>
        )}
        {!p.url && p.title && <h3 className="post-title">{p.title}</h3>}
        {p.text && (p.kind === "qa" || p.kind === "tips" ? <Markdown text={p.text} className="post-text" /> : <p className="post-text">{p.text}</p>)}
        <div className="post-actions">
          {cfg.replies && (
            <button className="link-btn" onClick={() => setOpen((v) => !v)}>
              <Icon name="reply" /> {p.replies.length ? `${p.replies.length} ${cfg.replies === "link" ? "suggestion" : "answer"}${p.replies.length === 1 ? "" : "s"}` : cfg.replies === "link" ? "Suggest a link" : "Answer"}
            </button>
          )}
          {(mine || staff) && (
            <button className="link-btn danger" onClick={() => { if (confirm("Delete this post?")) run({ action: "delete", id: p.id }, "Deleted"); }}>Delete</button>
          )}
        </div>
        {open && cfg.replies && (
          <div className="replies">
            {replies.map((r) => {
              const accepted = p.acceptedId === r.id;
              const rMine = r.user.toLowerCase() === me;
              return (
                <div key={r.id} className={`reply ${accepted ? "accepted" : ""}`}>
                  <div className="post-meta">
                    <UserChip username={r.user} face />
                    <span className="muted-inline">{timeAgo(r.at)}</span>
                    {accepted && <span className="pill approved">✓ best answer</span>}
                  </div>
                  {r.url && (
                    <a className="post-link" href={safeHref(r.url)} target="_blank" rel="noopener noreferrer">
                      <Favicon url={r.url} name={r.name || r.url} size={16} /> {r.name || hostOf(r.url)}
                    </a>
                  )}
                  {r.text && <Markdown text={r.text} className="post-text" />}
                  <div className="post-actions">
                    <button className={`link-btn ${r.votes.includes(me) ? "on" : ""}`} disabled={busy || rMine} onClick={() => run({ action: "vote", id: p.id, replyId: r.id })}>
                      👍 {r.votes.length || ""}
                    </button>
                    {cfg.accept && (mine || staff) && (
                      <button className="link-btn" onClick={() => run({ action: "accept", id: p.id, replyId: accepted ? "" : r.id }, accepted ? undefined : "Marked as the best answer")}>
                        {accepted ? "Unmark" : "✓ Best answer"}
                      </button>
                    )}
                    {(rMine || staff) && <button className="link-btn danger" onClick={() => run({ action: "delete", id: p.id, replyId: r.id })}>Delete</button>}
                  </div>
                </div>
              );
            })}
            <form
              className="reply-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run({ action: "reply", id: p.id, ...reply }, "Thanks for helping!")) setReply({ text: "", url: "", name: "" });
              }}
            >
              {cfg.replies === "link" && (
                <div className="board-form-row">
                  <input value={reply.url} onChange={(e) => setReply({ ...reply, url: e.target.value })} placeholder="https://…" inputMode="url" />
                  <input value={reply.name} onChange={(e) => setReply({ ...reply, name: e.target.value })} placeholder="Name (optional)" maxLength={100} />
                </div>
              )}
              <textarea value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} placeholder={cfg.replies === "link" ? "Why this one? (optional)" : "Your answer"} rows={2} maxLength={1500} />
              <div className="board-form-foot"><button className="btn btn-secondary btn-sm" disabled={busy}>{cfg.replies === "link" ? "Suggest" : "Answer"}</button></div>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
