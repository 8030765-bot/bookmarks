"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";
import { Icon } from "./CommandPalette";

const OPEN_POLL_MS = 3000;
const CLOSED_POLL_MS = 15000;
const REACTIONS = ["👍", "😂", "❤️", "🔥", "😮", "😢"];
const QUICK_EMOJI = ["😀", "😂", "🔥", "👍", "❤️", "🎮", "💀", "🙏"];

function timeLabel(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function mentions(text: string, name: string | null) {
  return !!name && new RegExp(`(^|\\W)@${name}(\\W|$)`, "i").test(text);
}

/** Renders @names highlighted and http(s) links clickable — everything else stays plain text. */
function RichText({ text, me }: { text: string; me: string | null }) {
  const parts = text.split(/(@[A-Za-z0-9_]{3,20}|https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("@")) {
          const self = me && p.slice(1).toLowerCase() === me.toLowerCase();
          return <span key={i} className={`mention ${self ? "self" : ""}`}>{p}</span>;
        }
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export default function ChatPanel({
  open,
  setOpen,
  chatEnabled,
  user,
  online,
  adminPassword,
  canModerate,
  onNeedLogin,
  showToast,
}: {
  open: boolean;
  setOpen: (fn: (open: boolean) => boolean) => void;
  chatEnabled: boolean;
  user: string | null;
  online: string[];
  adminPassword: string | null;
  canModerate: boolean;
  onNeedLogin: () => void;
  showToast: (msg: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.messages)) setMessages(json.messages);
    } catch {
      // network blip — next poll will retry
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  // ping when someone @mentions you while chat is closed
  useEffect(() => {
    if (!messages.length) return;
    if (seenIds.current && user && !open) {
      const fresh = messages.filter((m) => !seenIds.current!.has(m.id) && m.user !== user && mentions(m.text, user));
      if (fresh.length) showToast(`💬 ${fresh[fresh.length - 1].user} mentioned you in chat`);
    }
    seenIds.current = new Set(messages.map((m) => m.id));
  }, [messages, user, open, showToast]);

  const newestId = messages[messages.length - 1]?.id ?? null;
  useEffect(() => { if (open) setLastSeenId(newestId); }, [open, newestId]);
  useEffect(() => { if (lastSeenId === null && newestId) setLastSeenId(newestId); }, [lastSeenId, newestId]);
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, newestId]);

  const lastSeenIndex = messages.findIndex((m) => m.id === lastSeenId);
  const unreadList = lastSeenIndex >= 0 ? messages.slice(lastSeenIndex + 1) : [];
  const unread = !open ? unreadList.length : 0;
  const mentioned = !open && unreadList.some((m) => mentions(m.text, user));

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not send");
    setMessages(json.messages);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { onNeedLogin(); return; }
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await post({ text, replyTo: replyTo?.id });
      setText("");
      setReplyTo(null);
      setEmojiOpen(false);
    } catch (err: any) {
      showToast(err.message || "Could not send");
      if (err.message === "Log in to chat") onNeedLogin();
    } finally {
      setSending(false);
    }
  }

  async function react(id: string, emoji: string) {
    setPicker(null);
    if (!user) { onNeedLogin(); return; }
    try { await post({ action: "react", id, emoji }); } catch (err: any) { showToast(err.message); }
  }

  async function remove(id: string) {
    if (!canModerate || !confirm("Delete this message for everyone?")) return;
    const res = await fetch("/api/chat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password: adminPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(json.error || "Could not delete"); return; }
    setMessages(json.messages);
  }

  function mention(name: string) {
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${name} `);
    inputRef.current?.focus();
  }

  const me = user?.toLowerCase();
  return (
    <>
      <button className={`chat-fab ${mentioned ? "ping" : ""}`} onClick={() => setOpen((o) => !o)} aria-label="Toggle chat">
        {open ? <Icon name="x" /> : <Icon name="chat" />}
        {unread > 0 && <span className="chat-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <aside className="chat-panel">
          <div className="chat-header">
            <div>
              <strong>Class chat</strong>
              <div className="chat-online" title={online.join(", ")}>
                <span className="live-dot" /> {online.length ? `${online.length} online: ${online.slice(0, 4).join(", ")}${online.length > 4 ? "…" : ""}` : "nobody else logged in"}
              </div>
            </div>
            <span className="muted">{user ? `as ${user}` : "read-only"}</span>
          </div>
          <div className="chat-list" ref={listRef} onClick={() => setPicker(null)}>
            {messages.length === 0 && <div className="chat-empty">No messages yet. Say hi! 👋</div>}
            {messages.map((m, i) => {
              const mine = m.user === user;
              const grouped = i > 0 && messages[i - 1].user === m.user && !m.replyTo
                && new Date(m.at).getTime() - new Date(messages[i - 1].at).getTime() < 120000;
              const reactions = Object.entries(m.reactions || {});
              return (
                <div key={m.id} className={`chat-msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""} ${mentions(m.text, user) ? "mentioned" : ""}`}>
                  {!grouped && (
                    <div className="chat-meta">
                      <button className="chat-user" onClick={() => mention(m.user)} title={`Mention ${m.user}`}>{m.user}</button>
                      <span className="muted">{timeLabel(m.at)}</span>
                    </div>
                  )}
                  <div className="chat-bubble-row">
                    <div className="chat-text">
                      {m.replyTo && (
                        <div className="chat-quote"><Icon name="reply" /> <strong>{m.replyTo.user}</strong> {m.replyTo.text}</div>
                      )}
                      <RichText text={m.text} me={user} />
                    </div>
                    <div className="msg-tools">
                      <button title="React" onClick={(e) => { e.stopPropagation(); setPicker(picker === m.id ? null : m.id); }}>😊</button>
                      <button title="Reply" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}><Icon name="reply" /></button>
                      {canModerate && <button title="Delete" className="danger" onClick={() => remove(m.id)}><Icon name="trash" /></button>}
                    </div>
                  </div>
                  {picker === m.id && (
                    <div className="reaction-picker" onClick={(e) => e.stopPropagation()}>
                      {REACTIONS.map((r) => <button key={r} onClick={() => react(m.id, r)}>{r}</button>)}
                    </div>
                  )}
                  {reactions.length > 0 && (
                    <div className="reactions">
                      {reactions.map(([emoji, users]) => (
                        <button
                          key={emoji}
                          className={me && users.includes(me) ? "on" : ""}
                          onClick={() => react(m.id, emoji)}
                          title={users.join(", ")}
                        >
                          {emoji} {users.length}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!chatEnabled ? (
            <div className="chat-form chat-off">Chat has been turned off by an admin.</div>
          ) : user ? (
            <form className="chat-compose" onSubmit={send}>
              {replyTo && (
                <div className="reply-bar">
                  <Icon name="reply" /> Replying to <strong>{replyTo.user}</strong>
                  <span className="reply-snippet">{replyTo.text}</span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Icon name="x" /></button>
                </div>
              )}
              {emojiOpen && (
                <div className="emoji-row">
                  {QUICK_EMOJI.map((em) => (
                    <button type="button" key={em} onClick={() => { setText((t) => t + em); inputRef.current?.focus(); }}>{em}</button>
                  ))}
                </div>
              )}
              <div className="chat-form">
                <button type="button" className="emoji-toggle" onClick={() => setEmojiOpen((o) => !o)} title="Emoji">😀</button>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={replyTo ? `Reply to ${replyTo.user}…` : "Message — use @name to mention"}
                  maxLength={500}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Escape" && replyTo) { e.stopPropagation(); setReplyTo(null); } }}
                />
                <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>Send</button>
              </div>
            </form>
          ) : (
            <div className="chat-form">
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onNeedLogin}>
                Log in to chat
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
