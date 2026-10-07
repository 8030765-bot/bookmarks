"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatChannel, ChatMessage, ChatServer } from "@/lib/types";
import { Icon } from "../components/Icon";
import { holdFast, useOnRevChange, useSyncLoop } from "../components/sync";
import { Avatar, useFace, useFacesSync } from "../components/People";
import ChatText, { applyShortcodes } from "../components/ChatText";
import EmojiPicker from "../components/EmojiPicker";
import { shrinkImage } from "../components/ImageCropper";
import { humanError, readLocal, writeLocal } from "../components/ui";
import { usePresence } from "../components/Community";

/*
 * 💬 The chat app (opens in its own tab): servers down the left, their
 * channels next to it, messages in the middle and who's here on the right
 * — like Discord. "Whole class" is the site's own chat; anyone can make
 * a server with its own channels. Everything uses /api/chat (messages)
 * and /api/servers (servers), so the word filter, mutes, slow mode,
 * picture checks and reports all apply, and staff can see every server.
 */

const REACTIONS = ["👍", "😂", "❤️", "🔥", "😮", "😢", "🎉", "👀", "✅", "💯"];
const COLORS = ["#5865f2", "#3ba55d", "#faa61a", "#ed4245", "#eb459e", "#9b59b6", "#1abc9c", "#e67e22", "#607d8b"];
const HOME = "home";
const GROUP_MS = 7 * 60_000;

type Summary = { id: string; name: string; icon: string; color: string; description?: string; public: boolean; memberCount: number; owner: string; invite?: string };
interface ServerState { enabled: boolean; staff: boolean; servers: ChatServer[]; explore: Summary[]; all?: Summary[] }
interface ChatState {
  channel: string;
  messages: ChatMessage[];
  hasMore: boolean;
  roles: Record<string, string>;
  pins: ChatMessage[];
  channels: ChatChannel[];
  shortcodes: Record<string, string>;
  images: boolean;
  maxLen: number;
}
type Modal =
  | { type: "create" }
  | { type: "join"; code?: string }
  | { type: "settings"; id: string }
  | { type: "addChannel"; id: string }
  | { type: "invite"; id: string }
  | null;

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function stamp(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today at ${timeLabel(iso)}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday at ${timeLabel(iso)}`;
  return `${d.toLocaleDateString()} ${timeLabel(iso)}`;
}
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const mentions = (text: string, name: string | null) => !!name && new RegExp(`(^|\\W)@${name}(\\W|$)`, "i").test(text);

async function post(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "That didn't work");
  return json;
}

/** A server's round icon (an emoji or a letter on its colour). */
function ServerIcon({ s, size = 48 }: { s: { icon: string; color: string; name: string }; size?: number }) {
  return (
    <span className="dc-sicon" style={{ width: size, height: size, background: s.color, fontSize: size * (/\p{Extended_Pictographic}/u.test(s.icon) ? 0.5 : 0.4) }} aria-hidden="true">
      {s.icon || s.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const TAGS: Record<string, string> = { owner: "ADMIN", admin: "ADMIN", mod: "MOD", "srv-owner": "👑", "srv-mod": "SERVER MOD" };
const TAG_TITLES: Record<string, string> = { owner: "Runs the site", admin: "Site admin", mod: "Site moderator", "srv-owner": "Made this server", "srv-mod": "Helps run this server" };

function Name({ user, role }: { user: string; role?: string }) {
  const face = useFace(user);
  return (
    <span className={`dc-name ${role ? `role-${role}` : ""}`} style={face?.c && !role ? { color: face.c } : undefined}>
      {face?.n || user}
      {role && TAGS[role] && <span className={`dc-tag ${role}`} title={TAG_TITLES[role]}>{TAGS[role]}</span>}
    </span>
  );
}

export default function Discord() {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [srv, setSrv] = useState<ServerState>({ enabled: true, staff: false, servers: [], explore: [] });
  const [s, setS] = useState<ChatState>({ channel: "general", messages: [], hasMore: false, roles: {}, pins: [], channels: [], shortcodes: {}, images: true, maxLen: 500 });
  const [view, setView] = useState<"chat" | "explore">("chat");
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState(false);
  const [members, setMembers] = useState(true);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const [nav, setNav] = useState(false);
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [typing, setTyping] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [toast, setToastText] = useState("");
  const [loadErr, setLoadErr] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef("general");
  const lastTyping = useRef(0);
  const me = user?.toLowerCase() || null;
  const presence = usePresence(user);
  useSyncLoop(user);
  useFacesSync();
  useEffect(() => holdFast(), []);
  useEffect(() => {
    const join = () => setModal({ type: "join" });
    document.addEventListener("dc-join", join);
    return () => document.removeEventListener("dc-join", join);
  }, []);

  const showToast = useCallback((m: string) => { setToastText(m); setTimeout(() => setToastText(""), 3200); }, []);

  /* ---------- loading ---------- */
  const loadServers = useCallback(async () => {
    const j = await fetch("/api/servers", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j && Array.isArray(j.servers)) setSrv(j);
  }, []);
  const loadChat = useCallback(async (ch?: string) => {
    const want = ch || channelRef.current;
    try {
      const res = await fetch(`/api/chat?ch=${encodeURIComponent(want)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // a server you left (or that was deleted): back to the class chat
        if (want !== "general") { channelRef.current = "general"; loadChat("general"); }
        return;
      }
      setLoadErr(false);
      if (j.channel !== channelRef.current) return; // switched away meanwhile
      setS((p) => ({
        channel: j.channel, messages: j.messages || [], hasMore: !!j.hasMore, roles: j.roles || p.roles, pins: j.pins || [],
        channels: j.channels || p.channels, shortcodes: j.shortcodes || {}, images: j.images !== false, maxLen: j.maxLen || 500,
      }));
    } catch {
      setLoadErr(true);
    }
  }, []);

  useEffect(() => {
    document.title = "Chat";
    const params = new URLSearchParams(location.search);
    const start = params.get("ch") || readLocal<string>("dcChannel", "general");
    channelRef.current = start;
    setS((p) => ({ ...p, channel: start }));
    if (params.get("msg")) { setHighlight(params.get("msg")); setTimeout(() => setHighlight(null), 4000); }
    if (params.get("join")) setModal({ type: "join", code: params.get("join")! });
    if (params.get("text")) setText(params.get("text")!);
    if (location.search) history.replaceState(null, "", "/chat");
    fetch("/api/auth", { cache: "no-store" }).then((r) => r.json()).then((j) => { setUser(j.user || null); setRole(j.role || null); }).catch(() => {}).finally(() => setAuthed(true));
    loadServers();
    loadChat(start);
    setMembers(readLocal("dcMembers", true) && window.innerWidth > 1100);
  }, [loadChat, loadServers]);
  useOnRevChange("chat", () => { loadChat(); loadServers(); });

  // who's typing
  useEffect(() => {
    let live = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/chat?ch=${encodeURIComponent(s.channel)}&typing=1`, { cache: "no-store" }).then((r) => r.json()).then((j) => live && setTyping(j.typing || [])).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { live = false; clearInterval(id); };
  }, [s.channel]);

  /* ---------- where we are ---------- */
  const channel = s.channels.find((c) => c.id === s.channel);
  const serverId = channel?.serverId || (s.channel.startsWith("s-") ? s.channel.split("-")[1] : HOME);
  const server = srv.servers.find((x) => x.id === serverId) || null;
  const canManage = !!server && !!me && (srv.staff || server.owner === me || (server.mods || []).includes(me));
  const isStaff = srv.staff;
  const channelsHere = useMemo(() => {
    if (serverId === HOME) return s.channels.filter((c) => !c.serverId);
    const order = server?.channels || [];
    return s.channels.filter((c) => c.serverId === serverId).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [s.channels, serverId, server]);

  function openChannel(ch: string, keepNav = false) {
    writeLocal(`dcDraft:${channelRef.current}`, text);
    channelRef.current = ch;
    writeLocal("dcChannel", ch);
    const c = s.channels.find((x) => x.id === ch);
    const last = readLocal<Record<string, string>>("dcLast", {});
    writeLocal("dcLast", { ...last, [c?.serverId || HOME]: ch });
    setS((p) => ({ ...p, channel: ch, messages: [], pins: [], hasMore: false }));
    setText(readLocal(`dcDraft:${ch}`, ""));
    setReplyTo(null); setEditing(null); setImage(null); setPinsOpen(false); setView("chat"); if (!keepNav) setNav(false); setAtBottom(true);
    loadChat(ch);
    if (!keepNav) setTimeout(() => inputRef.current?.focus(), 50);
  }
  function openServer(id: string) {
    const last = readLocal<Record<string, string>>("dcLast", {})[id];
    const list = id === HOME ? s.channels.filter((c) => !c.serverId).map((c) => c.id) : srv.servers.find((x) => x.id === id)?.channels || [];
    openChannel(last && list.includes(last) ? last : list[0] || "general", true);
  }

  /* ---------- messages ---------- */
  const messages = s.messages;
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, s.channel]);
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => document.querySelector(`[data-msg-id="${highlight}"]`)?.scrollIntoView({ block: "center" }), 400);
    return () => clearTimeout(t);
  }, [highlight, messages.length]);
  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }
  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const before = el?.scrollHeight || 0;
    const j = await fetch(`/api/chat?ch=${encodeURIComponent(s.channel)}&before=${first.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j?.messages) return;
    setS((p) => ({ ...p, messages: [...j.messages, ...p.messages], hasMore: !!j.hasMore }));
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  }

  async function chat(body: Record<string, unknown>) {
    const j = await post("/api/chat", { ch: s.channel, ...body });
    if (Array.isArray(j.messages) && j.channel === channelRef.current) setS((p) => ({ ...p, messages: j.messages, hasMore: j.hasMore ?? p.hasMore, pins: j.pins || p.pins }));
    return j;
  }
  async function act(body: Record<string, unknown>, done?: string) {
    if (!user) { location.href = "/?login=1"; return; }
    try { await chat(body); if (done) showToast(done); } catch (e) { showToast(humanError(e)); }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user) { location.href = "/?login=1"; return; }
    const body = applyShortcodes(text, s.shortcodes).trim();
    if ((!body && !image) || sending) return;
    setSending(true);
    try {
      if (editing) {
        await chat({ action: "edit", id: editing.id, text: body });
        setEditing(null);
      } else {
        await chat({ text: body, replyTo: replyTo?.id, ...(image ? { image } : {}) });
        if (image && !isStaff) showToast("Picture sent — others see it once a moderator has checked it");
      }
      setText(""); setImage(null); setReplyTo(null); setEmojiOpen(false); setAtBottom(true);
      writeLocal(`dcDraft:${s.channel}`, "");
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
    } catch (err) {
      showToast(humanError(err, "Couldn't send that"));
    } finally {
      setSending(false);
    }
  }
  function onType(v: string) {
    setText(v);
    if (user && v.trim() && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      post("/api/chat", { action: "typing", ch: s.channel }).catch(() => {});
    }
  }
  async function attach(file: File | undefined) {
    if (!file) return;
    if (!s.images) { showToast("Pictures are turned off in chat"); return; }
    try { setImage(await shrinkImage(file, 1280)); } catch (e) { showToast(humanError(e)); }
  }
  async function report(m: ChatMessage) {
    const reason = prompt(`Report this message from ${m.user} to the moderators? Say what's wrong:`);
    if (!reason?.trim()) return;
    try {
      await post("/api/reports", { kind: "message", targetId: m.id, targetName: `${m.user}: ${m.text.slice(0, 80)}`, reason: reason.trim().slice(0, 300), extra: `${s.channel}: ${m.text.slice(0, 200)}` });
      showToast("Thanks — a moderator will take a look");
    } catch (e) { showToast(humanError(e)); }
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQ.trim()) { setResults(null); return; }
    const j = await fetch(`/api/chat?q=${encodeURIComponent(searchQ.trim())}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setResults(j?.results || []);
  }

  /* ---------- servers ---------- */
  async function servers(body: Record<string, unknown>, done?: string) {
    try {
      const j = await post("/api/servers", body);
      setSrv(j);
      if (done) showToast(done);
      return j;
    } catch (e) {
      showToast(humanError(e));
      return null;
    }
  }
  async function afterJoin(id: string) {
    await loadChat(channelRef.current);
    const j = await fetch(`/api/chat?ch=${encodeURIComponent(channelRef.current)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    const chans: ChatChannel[] = j?.channels || [];
    setS((p) => ({ ...p, channels: chans.length ? chans : p.channels }));
    const first = chans.find((c) => c.serverId === id);
    if (first) openChannel(first.id);
  }

  /* ---------- people ---------- */
  const onlineSet = new Set(presence.users.map((u) => u.toLowerCase()));
  const memberList = server ? server.members : Array.from(new Set([...presence.users.map((u) => u.toLowerCase()), ...messages.slice(-60).map((m) => m.user.toLowerCase())]));
  const online = memberList.filter((u) => onlineSet.has(u) || u === me);
  const offline = memberList.filter((u) => !onlineSet.has(u) && u !== me);
  const roleOf = (u: string) => (server && server.owner === u ? "srv-owner" : server && (server.mods || []).includes(u) ? "srv-mod" : undefined);
  const siteRole = (u: string) => s.roles[u] || s.roles[u.toLowerCase()];

  const canDelete = (m: ChatMessage) => !!me && (m.user.toLowerCase() === me || canManage || isStaff);

  /* ---------- rendering ---------- */
  if (authed && !user && view === "chat" && !s.messages.length && loadErr) {
    return <div className="dc-app dc-center"><p>Couldn&apos;t load chat. <button className="dc-link" onClick={() => loadChat()}>Try again</button></p></div>;
  }

  const title = server ? server.name : "Whole class";
  if (typeof document !== "undefined" && channel) {
    const t = `#${channel.name} · ${title} — Chat`;
    if (document.title !== t) setTimeout(() => { document.title = t; }, 0);
  }
  return (
    <div className={`dc-app ${members && view === "chat" ? "with-members" : ""} ${nav ? "nav-open" : ""}`}>
      {/* the server rail */}
      <nav className="dc-rail" aria-label="Servers">
        <button className={`dc-rail-btn ${view === "chat" && serverId === HOME ? "on" : ""}`} onClick={() => openServer(HOME)} title="Whole class">
          <span className="dc-sicon home" aria-hidden="true">🔖</span>
        </button>
        <span className="dc-rail-sep" />
        {srv.servers.map((x) => (
          <button key={x.id} className={`dc-rail-btn ${view === "chat" && serverId === x.id ? "on" : ""}`} onClick={() => openServer(x.id)} title={x.name}>
            <ServerIcon s={x} />
          </button>
        ))}
        {user && (srv.enabled || isStaff) && (
          <button className="dc-rail-btn add" onClick={() => setModal({ type: "create" })} title="Make a server">
            <span className="dc-sicon ghost"><Icon name="plus" /></span>
          </button>
        )}
        <button className={`dc-rail-btn add ${view === "explore" ? "on" : ""}`} onClick={() => { setView("explore"); setNav(false); }} title="Find servers">
          <span className="dc-sicon ghost"><Icon name="search" /></span>
        </button>
        <a className="dc-rail-btn back" href="/" title="Back to the bookmarks">
          <span className="dc-sicon ghost"><Icon name="home" /></span>
        </a>
      </nav>

      {/* channels */}
      <aside className="dc-side">
        <div className="dc-server-head">
          <button className="dc-server-name" onClick={() => server && setMenu((m) => !m)} aria-expanded={menu} disabled={!server}>
            <span>{view === "explore" ? "Find servers" : title}</span>
            {server && view === "chat" && <Icon name="down" />}
          </button>
          {menu && server && (
            <>
              <div className="dc-backdrop" onClick={() => setMenu(false)} />
              <div className="dc-menu" role="menu">
                <button onClick={() => { setMenu(false); setModal({ type: "invite", id: server.id }); }}><Icon name="users" /> Invite people</button>
                {canManage && <button onClick={() => { setMenu(false); setModal({ type: "settings", id: server.id }); }}><Icon name="settings" /> Server settings</button>}
                {canManage && <button onClick={() => { setMenu(false); setModal({ type: "addChannel", id: server.id }); }}><Icon name="plus" /> Create channel</button>}
                {server.owner !== me && (
                  <button className="danger" onClick={async () => {
                    setMenu(false);
                    if (!confirm(`Leave ${server.name}?`)) return;
                    if (await servers({ action: "leave", id: server.id }, `You left ${server.name}`)) openServer(HOME);
                  }}><Icon name="logout" /> Leave server</button>
                )}
              </div>
            </>
          )}
        </div>
        {view === "explore" ? (
          <div className="dc-channels">
            <p className="dc-side-note">Join a public server, or use an invite code someone gave you.</p>
            {user && <button className="dc-chan" onClick={() => setModal({ type: "join" })}><span className="dc-hash"><Icon name="link" /></span>Join with an invite</button>}
          </div>
        ) : (
          <div className="dc-channels">
            {server?.description && <p className="dc-side-note">{server.description}</p>}
            <div className="dc-cat">
              <span>Text channels</span>
              {canManage && <button onClick={() => setModal({ type: "addChannel", id: server!.id })} title="Create channel" aria-label="Create channel"><Icon name="plus" /></button>}
            </div>
            {channelsHere.map((c) => (
              <button key={c.id} className={`dc-chan ${c.id === s.channel ? "on" : ""}`} onClick={() => openChannel(c.id)}>
                <span className="dc-hash">#</span>
                <span className="dc-chan-name">{c.name}</span>
                {c.clubId && <span className="dc-chan-tag">club</span>}
                {canManage && server && c.id === s.channel && server.channels.length > 1 && (
                  <span className="dc-chan-x" role="button" tabIndex={0} title="Delete channel" onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete #${c.name} and all its messages?`)) return;
                    if (await servers({ action: "removeChannel", id: server.id, ch: c.id }, `#${c.name} deleted`)) openServer(server.id);
                  }}><Icon name="trash" /></span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="dc-userbar">
          {user ? (
            <>
              <Avatar name={user} size={32} online />
              <span className="dc-userbar-name"><strong><Name user={user} /></strong><em>{role ? role : "Online"}</em></span>
              <a className="dc-icon-btn" href={`/u/${encodeURIComponent(user)}`} title="Your profile"><Icon name="user" /></a>
            </>
          ) : (
            <a className="dc-btn primary wide" href="/?login=1">Log in to chat</a>
          )}
        </div>
      </aside>

      {/* the middle */}
      {view === "explore" ? (
        <main className="dc-main dc-explore">
          <div className="dc-explore-bar">
            <button className="dc-icon-btn dc-burger" onClick={() => setNav(true)} aria-label="Servers and channels"><Icon name="list" /></button>
            {user && <button className="dc-btn sm" onClick={() => setModal({ type: "join" })}><Icon name="link" /> Join with an invite</button>}
          </div>
          <header className="dc-explore-hero">
            <h1>Find your people</h1>
            <p>Servers are groups with their own channels. Anyone at school can join a public one.</p>
            {!srv.enabled && <p className="dc-warn">Making new servers is turned off by the admins.</p>}
          </header>
          <div className="dc-cards">
            {srv.explore.length === 0 && <p className="dc-muted">No public servers to join yet{user && srv.enabled ? " — make the first one with the + button!" : "."}</p>}
            {srv.explore.map((x) => (
              <div key={x.id} className="dc-card">
                <div className="dc-card-banner" style={{ background: x.color }} />
                <ServerIcon s={x} size={56} />
                <strong>{x.name}</strong>
                <p>{x.description || "No description yet."}</p>
                <span className="dc-muted">{x.memberCount} member{x.memberCount === 1 ? "" : "s"}</span>
                {user ? <button className="dc-btn primary" onClick={async () => { const j = await servers({ action: "join", id: x.id }, `Welcome to ${x.name}!`); if (j) afterJoin(x.id); }}>Join</button>
                  : <a className="dc-btn" href="/?login=1">Log in to join</a>}
              </div>
            ))}
          </div>
          {isStaff && srv.all && srv.all.length > 0 && (
            <>
              <h2 className="dc-h2">Every server <span className="dc-tag">STAFF</span></h2>
              <p className="dc-muted">Staff can see and join any server, including invite-only ones, to check on them.</p>
              <div className="dc-staff-list">
                {srv.all.map((x) => (
                  <div key={x.id} className="dc-staff-row">
                    <ServerIcon s={x} size={32} />
                    <span><strong>{x.name}</strong> <em>{x.public ? "public" : "invite only"} · {x.memberCount} members · owner {x.owner}</em></span>
                    <button className="dc-btn sm" onClick={async () => { const j = await servers({ action: "join", id: x.id }); if (j) afterJoin(x.id); }}>Join</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      ) : (
        <main className="dc-main">
          <header className="dc-chan-head">
            <button className="dc-icon-btn dc-burger" onClick={() => setNav(true)} aria-label="Servers and channels"><Icon name="list" /></button>
            <span className="dc-hash big">#</span>
            <strong>{channel?.name || "…"}</strong>
            {channel?.topic && <span className="dc-topic" title={channel.topic}>{channel.topic}</span>}
            <span className="dc-head-tools">
              <button className={`dc-icon-btn ${pinsOpen ? "on" : ""}`} onClick={() => setPinsOpen((o) => !o)} title="Pinned messages" aria-label="Pinned messages"><Icon name="pin" />{s.pins.length > 0 && <span className="dc-count">{s.pins.length}</span>}</button>
              <button className={`dc-icon-btn ${members ? "on" : ""}`} onClick={() => { setMembers((m) => { writeLocal("dcMembers", !m); return !m; }); setResults(null); }} title="Member list" aria-label="Member list"><Icon name="users" /></button>
              <form className="dc-search" onSubmit={search}>
                <input value={searchQ} onChange={(e) => { setSearchQ(e.target.value); if (!e.target.value) setResults(null); }} placeholder="Search" aria-label="Search messages" />
                <Icon name="search" />
              </form>
            </span>
            {pinsOpen && (
              <div className="dc-pop">
                <div className="dc-pop-head">📌 Pinned messages</div>
                {s.pins.length === 0 && <p className="dc-muted">Nothing pinned in #{channel?.name} yet.</p>}
                {s.pins.map((m) => (
                  <button key={m.id} className="dc-pop-item" onClick={() => { setPinsOpen(false); setHighlight(m.id); setTimeout(() => setHighlight(null), 3000); }}>
                    <strong>{m.user}</strong> <span>{m.text.slice(0, 140)}</span>
                  </button>
                ))}
              </div>
            )}
          </header>

          <div className="dc-messages" ref={listRef} onScroll={onScroll}>
            {s.hasMore ? (
              <button className="dc-older" onClick={loadOlder}>Load older messages</button>
            ) : (
              <div className="dc-welcome">
                <span className="dc-welcome-icon">#</span>
                <h2>Welcome to #{channel?.name || "chat"}!</h2>
                <p>This is the start of #{channel?.name}{server ? ` in ${server.name}` : ""}. {channel?.topic || ""}</p>
                {channel?.rules && <p className="dc-rules">📜 {channel.rules}</p>}
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
              const grouped = !!prev && !newDay && prev.user === m.user && !m.replyTo && !prev.kind && !m.kind && Date.parse(m.at) - Date.parse(prev.at) < GROUP_MS;
              const mine = m.user.toLowerCase() === me;
              const pinged = !mine && mentions(m.text, user);
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="dc-day"><span>{dayLabel(m.at)}</span></div>}
                  <div className={`dc-msg ${grouped ? "grouped" : ""} ${pinged ? "pinged" : ""} ${highlight === m.id ? "flash" : ""} ${m.kind === "announce" ? "announce" : ""}`} data-msg-id={m.id}>
                    {m.replyTo && (
                      <button className="dc-reply-ref" onClick={() => { setHighlight(m.replyTo!.id); setTimeout(() => setHighlight(null), 2500); }}>
                        <span className="dc-reply-line" /> <strong>@{m.replyTo.user}</strong> <span>{m.replyTo.text}</span>
                      </button>
                    )}
                    {grouped ? (
                      <span className="dc-gutter-time" title={stamp(m.at)}>{timeLabel(m.at)}</span>
                    ) : (
                      <a className="dc-avatar" href={`/u/${encodeURIComponent(m.user)}`} target="_blank" rel="noreferrer" title={m.user}><Avatar name={m.user} size={40} /></a>
                    )}
                    <div className="dc-body">
                      {!grouped && (
                        <div className="dc-meta">
                          <Name user={m.user} role={siteRole(m.user) || roleOf(m.user.toLowerCase())} />
                          <time title={new Date(m.at).toLocaleString()}>{stamp(m.at)}</time>
                        </div>
                      )}
                      {m.kind === "poll" && m.poll ? (
                        <div className="dc-poll">
                          <strong>📊 {m.poll.question}</strong>
                          {m.poll.options.map((o, k) => {
                            const votes = m.poll!.votes?.[k] || [];
                            const total = Object.values(m.poll!.votes || {}).reduce((n, v) => n + v.length, 0) || 1;
                            const mineVote = !!me && votes.includes(me);
                            return (
                              <button key={k} className={`dc-poll-opt ${mineVote ? "mine" : ""}`} onClick={() => act({ action: "vote", id: m.id, option: k })}>
                                <span className="dc-poll-fill" style={{ width: `${(votes.length / total) * 100}%` }} />
                                <span>{o}</span><em>{votes.length}</em>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={`dc-text ${m.kind === "me" ? "me" : ""} ${m.kind === "roll" ? "roll" : ""}`}>
                          {m.kind === "me" && <>* {m.user} </>}
                          {m.text && <ChatText text={m.text} me={user} known={() => undefined} />}
                          {m.edited && <span className="dc-edited"> (edited)</span>}
                          {m.answered && <span className="dc-answered"> ✅ answered</span>}
                        </div>
                      )}
                      {m.img && (m.imgPending ? (
                        mine || isStaff ? <div className="dc-img-wrap pending"><img src={`/api/img/${m.img}`} alt="Your picture" /><span>Waiting for a moderator — only you can see it</span></div> : null
                      ) : (
                        <a className="dc-img-wrap" href={`/api/img/${m.img}`} target="_blank" rel="noreferrer"><img src={`/api/img/${m.img}`} alt={`Picture from ${m.user}`} loading="lazy" /></a>
                      ))}
                      {m.reactions && Object.keys(m.reactions).length > 0 && (
                        <div className="dc-reacts">
                          {Object.entries(m.reactions).map(([e, who]) => (
                            <button key={e} className={`dc-react ${me && who.includes(me) ? "mine" : ""}`} onClick={() => act({ action: "react", id: m.id, emoji: e })} title={who.join(", ")}>
                              {e} <span>{who.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {user && (
                      <div className="dc-tools">
                        <button onClick={() => setReactFor(reactFor === m.id ? null : m.id)} title="Add reaction" aria-label="Add reaction">😀</button>
                        <button onClick={() => { setReplyTo(m); setEditing(null); inputRef.current?.focus(); }} title="Reply" aria-label="Reply"><Icon name="reply" /></button>
                        {mine && (!m.kind || m.kind === "text" || m.kind === "me") && <button onClick={() => { setEditing(m); setReplyTo(null); setText(m.text); inputRef.current?.focus(); }} title="Edit" aria-label="Edit"><Icon name="edit" /></button>}
                        {(canManage || isStaff) && <button onClick={() => act({ action: "pin", id: m.id, pinned: !s.pins.some((p) => p.id === m.id) }, s.pins.some((p) => p.id === m.id) ? "Unpinned" : "Pinned")} title="Pin" aria-label="Pin"><Icon name="pin" /></button>}
                        {!mine && <button onClick={() => report(m)} title="Report to the moderators" aria-label="Report"><Icon name="bulb" /></button>}
                        {canDelete(m) && <button className="danger" onClick={() => { if (confirm("Delete this message?")) act({ action: "delete", id: m.id }, "Message deleted"); }} title="Delete" aria-label="Delete"><Icon name="trash" /></button>}
                        {reactFor === m.id && (
                          <div className="dc-react-pick">
                            {REACTIONS.map((e) => <button key={e} onClick={() => { setReactFor(null); act({ action: "react", id: m.id, emoji: e }); }}>{e}</button>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
          {!atBottom && (
            <button className="dc-jump" onClick={() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; setAtBottom(true); }}>You&apos;re viewing older messages — Jump to present</button>
          )}

          <form className="dc-compose" onSubmit={send}>
            {(replyTo || editing) && (
              <div className="dc-compose-bar">
                {editing ? <>Editing your message</> : <>Replying to <strong>{replyTo!.user}</strong></>}
                <button type="button" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }} aria-label="Cancel"><Icon name="x" /></button>
              </div>
            )}
            {image && (
              <div className="dc-attach">
                <img src={image} alt="Picture to send" />
                <button type="button" onClick={() => setImage(null)} aria-label="Remove picture"><Icon name="x" /></button>
              </div>
            )}
            <div className="dc-input">
              {user && s.images && (
                <>
                  <button type="button" className="dc-plus" onClick={() => fileRef.current?.click()} title="Send a picture" aria-label="Send a picture"><Icon name="plus" /></button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} />
                </>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                maxLength={s.maxLen}
                disabled={!user}
                placeholder={user ? `Message #${channel?.name || ""}` : "Log in to chat"}
                onChange={(e) => onType(e.target.value)}
                onPaste={(e) => { const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); attach(f); } }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  if (e.key === "Escape") { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }
                  if (e.key === "ArrowUp" && !text) {
                    const last = [...messages].reverse().find((m) => m.user.toLowerCase() === me && (!m.kind || m.kind === "text"));
                    if (last) { e.preventDefault(); setEditing(last); setText(last.text); }
                  }
                }}
              />
              {user && <button type="button" className="dc-emoji-btn" onClick={() => setEmojiOpen((o) => !o)} title="Emoji" aria-label="Emoji">😊</button>}
              {emojiOpen && <div className="dc-emoji-pop"><EmojiPicker recent={[]} onPick={(e) => { setText((t) => t + e); inputRef.current?.focus(); }} /></div>}
            </div>
            <div className="dc-typing">
              {typing.length > 0 && <><span className="dc-dots"><i /><i /><i /></span> <strong>{typing.slice(0, 3).join(", ")}</strong> {typing.length === 1 ? "is" : "are"} typing…</>}
            </div>
          </form>
        </main>
      )}

      {/* members, or search results */}
      {view === "chat" && (members || results) && (
        <aside className="dc-members">
          {results ? (
            <>
              <div className="dc-cat"><span>{results.length} result{results.length === 1 ? "" : "s"}</span><button onClick={() => { setResults(null); setSearchQ(""); }} aria-label="Close search"><Icon name="x" /></button></div>
              {results.map((m) => {
                const c = s.channels.find((x) => x.id === (m.channel || "general"));
                return (
                  <button key={m.id} className="dc-result" onClick={() => { setResults(null); if (m.channel && m.channel !== s.channel) openChannel(m.channel); setHighlight(m.id); setTimeout(() => setHighlight(null), 4000); }}>
                    <span className="dc-muted">#{c?.name || m.channel} · {stamp(m.at)}</span>
                    <strong>{m.user}</strong>
                    <span>{m.text.slice(0, 120)}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <div className="dc-cat"><span>Online — {online.length}</span></div>
              {online.map((u) => <Member key={u} u={u} online role={roleOf(u)} manage={canManage && !!server && u !== me && u !== server.owner} onAction={(a) => server && servers({ action: a, id: server.id, user: u, on: a === "mod" ? !(server.mods || []).includes(u) : undefined }, a === "kick" ? `${u} was removed` : a === "ban" ? `${u} was banned from ${server.name}` : undefined)} isOwnerView={!!server && server.owner === me} isMod={!!server && (server.mods || []).includes(u)} />)}
              {offline.length > 0 && <div className="dc-cat"><span>Offline — {offline.length}</span></div>}
              {offline.map((u) => <Member key={u} u={u} role={roleOf(u)} manage={canManage && !!server && u !== me && u !== server.owner} onAction={(a) => server && servers({ action: a, id: server.id, user: u, on: a === "mod" ? !(server.mods || []).includes(u) : undefined }, a === "kick" ? `${u} was removed` : a === "ban" ? `${u} was banned from ${server.name}` : undefined)} isOwnerView={!!server && server.owner === me} isMod={!!server && (server.mods || []).includes(u)} />)}
            </>
          )}
        </aside>
      )}
      {nav && <div className="dc-scrim" onClick={() => setNav(false)} />}

      {modal && (
        <ServerModal
          modal={modal}
          srv={srv}
          channels={s.channels}
          me={me}
          onClose={() => setModal(null)}
          run={servers}
          afterJoin={afterJoin}
          openChannel={openChannel}
          openHome={() => openServer(HOME)}
          showToast={showToast}
        />
      )}
      {toast && <div className="dc-toast" role="status">{toast}</div>}
    </div>
  );
}

function Member({ u, online = false, role, manage, onAction, isOwnerView, isMod }: {
  u: string; online?: boolean; role?: string; manage: boolean; onAction: (a: "kick" | "ban" | "mod") => void; isOwnerView: boolean; isMod: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`dc-member ${online ? "" : "off"}`}>
      <a href={`/u/${encodeURIComponent(u)}`} target="_blank" rel="noreferrer" className="dc-member-link">
        <Avatar name={u} size={32} online={online} />
        <Name user={u} role={role} />
      </a>
      {manage && (
        <span className="dc-member-more">
          <button onClick={() => setOpen((o) => !o)} aria-label={`Options for ${u}`}><Icon name="more" /></button>
          {open && (
            <>
              <div className="dc-backdrop" onClick={() => setOpen(false)} />
              <div className="dc-menu right">
                {isOwnerView && <button onClick={() => { setOpen(false); onAction("mod"); }}><Icon name="lock" /> {isMod ? "Remove moderator" : "Make moderator"}</button>}
                <button onClick={() => { setOpen(false); if (confirm(`Remove ${u} from the server? They can join again.`)) onAction("kick"); }}><Icon name="logout" /> Kick {u}</button>
                <button className="danger" onClick={() => { setOpen(false); if (confirm(`Ban ${u}? They won't be able to join again.`)) onAction("ban"); }}><Icon name="x" /> Ban {u}</button>
              </div>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function ServerModal({ modal, srv, channels, me, onClose, run, afterJoin, openChannel, openHome, showToast }: {
  modal: NonNullable<Modal>;
  srv: ServerState;
  channels: ChatChannel[];
  me: string | null;
  onClose: () => void;
  run: (body: Record<string, unknown>, done?: string) => Promise<ServerState & { created?: string; joined?: string; invite?: string } | null>;
  afterJoin: (id: string) => Promise<void>;
  openChannel: (id: string) => void;
  openHome: () => void;
  showToast: (m: string) => void;
}) {
  const server = "id" in modal ? srv.servers.find((x) => x.id === modal.id) : undefined;
  const [name, setName] = useState(server?.name || "");
  const [icon, setIcon] = useState(server?.icon || "");
  const [color, setColor] = useState(server?.color || COLORS[0]);
  const [desc, setDesc] = useState(server?.description || "");
  const [isPublic, setPublic] = useState(server ? server.public : true);
  const [code, setCode] = useState(modal.type === "join" ? modal.code || "" : "");
  const [chan, setChan] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const inviteUrl = server ? `${typeof location !== "undefined" ? location.origin : ""}/chat?join=${server.invite}` : "";
  const go = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const preview = { name: name || "New server", icon: icon || (name ? name.slice(0, 1).toUpperCase() : "?"), color };
  const looks = (
    <>
      <div className="dc-form-row">
        <ServerIcon s={preview} size={72} />
        <div className="dc-form-col">
          <label>Server name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Year 7 Study Group" autoFocus /></label>
          <label>Icon (an emoji, or leave empty for the first letter)<input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} placeholder="📚" /></label>
        </div>
      </div>
      <div className="dc-swatches" role="radiogroup" aria-label="Colour">
        {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} className={color === c ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}
      </div>
      <label>What&apos;s it for? (optional)<input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={160} placeholder="Homework help and revision" /></label>
      <label className="dc-check"><input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} /> <span><strong>Public</strong> — anyone can find and join it in Find servers. Otherwise people need an invite. (Admins and moderators can always see every server.)</span></label>
    </>
  );

  return (
    <div className="dc-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dc-modal" role="dialog" aria-modal="true">
        <button className="dc-modal-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        {modal.type === "create" && (
          <form onSubmit={(e) => { e.preventDefault(); go(async () => {
            const j = await run({ action: "create", server: { name, icon, color, description: desc, public: isPublic } }, "Server made! 🎉");
            if (j?.created) { onClose(); await afterJoin(j.created); }
          }); }}>
            <h2>Make your server</h2>
            <p className="dc-muted">Your server is where you and your friends hang out. Make one and start talking. The site&apos;s chat rules still apply.</p>
            {looks}
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn ghost" onClick={() => onClose()}>Cancel</button>
              <button className="dc-btn primary" disabled={busy || name.trim().length < 2}>Create</button>
            </div>
            <p className="dc-muted small">Got an invite instead? <button type="button" className="dc-link" onClick={() => { onClose(); setTimeout(() => document.dispatchEvent(new CustomEvent("dc-join")), 0); }}>Join a server</button></p>
          </form>
        )}
        {modal.type === "join" && (
          <form onSubmit={(e) => { e.preventDefault(); go(async () => {
            const j = await run({ action: "join", code }, "You joined! 👋");
            if (j?.joined) { onClose(); await afterJoin(j.joined); }
          }); }}>
            <h2>Join a server</h2>
            <p className="dc-muted">Paste an invite link or code someone gave you.</p>
            <label>Invite link or code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/chat?join=abcd2345" autoFocus /></label>
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn ghost" onClick={onClose}>Cancel</button>
              <button className="dc-btn primary" disabled={busy || !code.trim()}>Join</button>
            </div>
          </form>
        )}
        {modal.type === "invite" && server && (
          <div>
            <h2>Invite friends to {server.name}</h2>
            <p className="dc-muted">Send them this link. Anyone with it can join while it works.</p>
            <div className="dc-invite">
              <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
              <button className="dc-btn primary" onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => showToast("Invite link copied")).catch(() => showToast(inviteUrl))}>Copy</button>
            </div>
            <p className="dc-muted small">Code: <code>{server.invite}</code> · <button className="dc-link" onClick={() => run({ action: "invite", id: server.id }, "Made a new link — the old one stops working")}>Make a new link</button></p>
          </div>
        )}
        {modal.type === "addChannel" && server && (
          <form onSubmit={(e) => { e.preventDefault(); go(async () => {
            const j = await run({ action: "addChannel", id: server.id, channel: { name: chan, topic } }, `#${chan.toLowerCase().replace(/[^a-z0-9]+/g, "-")} created`);
            if (j) {
              onClose();
              const made = (j as unknown as { channels?: ChatChannel[] }).channels?.slice(-1)[0];
              await afterJoin(server.id);
              if (made) openChannel(made.id);
            }
          }); }}>
            <h2>Create a channel</h2>
            <p className="dc-muted">in {server.name}</p>
            <label>Channel name<div className="dc-prefix"><span>#</span><input value={chan} onChange={(e) => setChan(e.target.value.toLowerCase().replace(/\s+/g, "-"))} maxLength={28} placeholder="homework-help" autoFocus /></div></label>
            <label>Topic (optional)<input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="What this channel is about" /></label>
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn ghost" onClick={onClose}>Cancel</button>
              <button className="dc-btn primary" disabled={busy || !chan.trim()}>Create channel</button>
            </div>
          </form>
        )}
        {modal.type === "settings" && server && (
          <form onSubmit={(e) => { e.preventDefault(); go(async () => {
            if (await run({ action: "update", id: server.id, server: { name, icon, color, description: desc, public: isPublic } }, "Saved")) onClose();
          }); }}>
            <h2>Server settings</h2>
            {looks}
            <div className="dc-modal-actions">
              <button type="button" className="dc-btn ghost" onClick={onClose}>Cancel</button>
              <button className="dc-btn primary" disabled={busy || name.trim().length < 2}>Save changes</button>
            </div>
            <h3 className="dc-h3">Channels</h3>
            <ul className="dc-plain">
              {server.channels.map((id) => {
                const c = channels.find((x) => x.id === id);
                return <li key={id}># {c?.name || id}</li>;
              })}
            </ul>
            {(server.banned || []).length > 0 && (
              <>
                <h3 className="dc-h3">Banned</h3>
                <ul className="dc-plain">
                  {server.banned!.map((u) => <li key={u}>{u} <button type="button" className="dc-link" onClick={() => run({ action: "unban", id: server.id, user: u }, `${u} can join again`)}>Unban</button></li>)}
                </ul>
              </>
            )}
            {(server.owner === me || srv.staff) && (
              <div className="dc-danger">
                <h3 className="dc-h3">Delete server</h3>
                <p className="dc-muted small">This deletes {server.name}, its channels and every message in them. It can&apos;t be undone. Type the server&apos;s name to confirm.</p>
                <div className="dc-invite">
                  <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={server.name} />
                  <button type="button" className="dc-btn danger" disabled={confirmName.trim() !== server.name} onClick={() => go(async () => {
                    if (await run({ action: "delete", id: server.id }, `${server.name} was deleted`)) { onClose(); openHome(); }
                  })}>Delete server</button>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
