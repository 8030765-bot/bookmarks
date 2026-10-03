"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";

const OPEN_POLL_MS = 3000;
const CLOSED_POLL_MS = 15000;

function timeLabel(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatPanel({
  user,
  adminPassword,
  onNeedLogin,
  showToast,
}: {
  user: string | null;
  adminPassword: string | null;
  onNeedLogin: () => void;
  showToast: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  const newestId = messages[messages.length - 1]?.id ?? null;

  // while open, everything is "seen"
  useEffect(() => {
    if (open) setLastSeenId(newestId);
  }, [open, newestId]);

  // first load: don't flag old history as unread
  useEffect(() => {
    if (lastSeenId === null && newestId) setLastSeenId(newestId);
  }, [lastSeenId, newestId]);

  // keep scrolled to bottom when new messages arrive
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, newestId]);

  const unread = !open && newestId !== null && lastSeenId !== null && newestId !== lastSeenId;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { onNeedLogin(); return; }
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not send");
      setMessages(json.messages);
      setText("");
    } catch (err: any) {
      showToast(err.message || "Could not send");
      if (err.message === "Log in to chat") onNeedLogin();
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    if (!adminPassword || !confirm("Delete this message for everyone?")) return;
    const res = await fetch("/api/chat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password: adminPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(json.error || "Could not delete"); return; }
    setMessages(json.messages);
  }

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label="Toggle chat">
        {open ? "✕" : "💬"}
        {unread && <span className="chat-dot" />}
      </button>
      {open && (
        <aside className="chat-panel">
          <div className="chat-header">
            <strong>💬 Class chat</strong>
            <span className="muted">{user ? `as ${user}` : "read-only"}</span>
          </div>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <div className="chat-empty">No messages yet. Say hi!</div>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.user === user ? "mine" : ""}`}>
                <div className="chat-meta">
                  <span className="chat-user">{m.user}</span>
                  <span className="muted">{timeLabel(m.at)}</span>
                  {adminPassword && (
                    <button className="chat-del" title="Delete message" onClick={() => remove(m.id)}>✕</button>
                  )}
                </div>
                <div className="chat-text">{m.text}</div>
              </div>
            ))}
          </div>
          {user ? (
            <form className="chat-form" onSubmit={send}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message…"
                maxLength={500}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>Send</button>
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
