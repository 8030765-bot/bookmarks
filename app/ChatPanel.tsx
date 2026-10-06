"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatChannel, ChatMessage } from "@/lib/types";
import { Icon } from "./components/Icon";
import { holdFast, useOnRevChange } from "./components/sync";
import { UserChip, useFaces } from "./components/People";
import ChatText, { KnownLink, SHORTCODES, applyShortcodes } from "./components/ChatText";
import { shrinkImage } from "./components/ImageCropper";
import { humanError } from "./components/ui";
import EmojiPicker from "./components/EmojiPicker";
import { readLocal, writeLocal } from "./components/ui";

const REACTIONS = ["👍", "😂", "❤️", "🔥", "😮", "😢", "🎉", "👀", "✅", "💯"];
type ChatStyle = "bubbles" | "compact";
type Dock = "float" | "side";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}
function mentions(text: string, name: string | null) {
  return !!name && new RegExp(`(^|\\W)@${name}(\\W|$)`, "i").test(text);
}

interface ChatState {
  channel: string;
  messages: ChatMessage[];
  hasMore: boolean;
  roles: Record<string, string>;
  pins: ChatMessage[];
  channels: ChatChannel[];
  keywords: string[];
  shortcodes: Record<string, string>;
  /** your notification level per channel (missing = all) */
  notifyLevels: Record<string, "all" | "mentions" | "none">;
  /** pictures allowed in chat */
  images: boolean;
  maxLen: number;
}

export default function ChatPanel({
  open,
  setOpen,
  chatEnabled,
  user,
  online,
  adminPassword,
  canModerate,
  isAdmin = false,
  onNeedLogin,
  showToast,
  blocked = [],
  onBlock,
  onMention,
  quiet = false,
  known = () => undefined,
  savedIds = new Set<string>(),
  onSave,
  onOpenClubs,
  target,
  fullPage = false,
  siteLinks = [],
  hidden = false,
}: {
  open: boolean;
  setOpen: (fn: (open: boolean) => boolean) => void;
  chatEnabled: boolean;
  user: string | null;
  online: string[];
  adminPassword: string | null;
  canModerate: boolean;
  isAdmin?: boolean;
  onNeedLogin: () => void;
  showToast: (msg: string, action?: { label: string; run: () => void }) => void;
  /** people whose messages you've hidden (lowercase) */
  blocked?: string[];
  onBlock?: (username: string) => void;
  /** someone @mentioned you while chat was closed */
  onMention?: () => void;
  /** do-not-disturb: no pop-ups */
  quiet?: boolean;
  /** turns a URL into a bookmark on the site, if it is one */
  known?: (url: string) => KnownLink | undefined;
  savedIds?: Set<string>;
  onSave?: (m: ChatMessage, on: boolean) => void;
  onOpenClubs?: () => void;
  /** open a channel (and optionally scroll to a message) — from links and notifications */
  target?: { channel?: string; msg?: string; reply?: string; text?: string } | null;
  /** the pop-out /chat page */
  fullPage?: boolean;
  /** the site's websites, for the @link picker */
  siteLinks?: KnownLink[];
  /** focus mode: nothing shows */
  hidden?: boolean;
}) {
  const [s, setS] = useState<ChatState>({ channel: "general", messages: [], hasMore: false, roles: {}, pins: [], channels: [], keywords: [], shortcodes: {}, maxLen: 500, notifyLevels: {}, images: true });
  const channel = s.channel;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentEmoji, setRecentEmoji] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const [threadOf, setThreadOf] = useState<ChatMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatStyle, setChatStyle] = useState<ChatStyle>("bubbles");
  const [dock, setDock] = useState<Dock>("float");
  const [previews, setPreviews] = useState(true);
  const [muteUntil, setMuteUntil] = useState<Record<string, number>>({});
  const muted = Object.keys(muteUntil).filter((c) => muteUntil[c] === 0 || muteUntil[c] > Date.now());
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sugIdx, setSugIdx] = useState(0);
  const [linkQ, setLinkQ] = useState<string | null>(null);
  const [emojiQ, setEmojiQ] = useState<string | null>(null);
  const [dividerSeen, setDividerSeen] = useState(false);
  // clicking anywhere outside the message box closes the emoji picker
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.(".chat-compose")) setEmojiOpen(false); };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [emojiOpen]);
  const [width, setWidth] = useState<number | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => { const w = readLocal<number | null>("chatWidth", null); if (w) setWidth(w); }, []);
  /** Drag (or arrow keys on) the left edge to make the panel wider or narrower. */
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const panel = (e.currentTarget as HTMLElement).parentElement!;
    const startW = panel.getBoundingClientRect().width;
    const move = (ev: PointerEvent) => setWidth(clampWidth(startW + (startX - ev.clientX)));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      writeLocal("chatWidth", clampWidth(startW + (startX - ev.clientX)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const clampWidth = (w: number) => Math.round(Math.min(Math.max(300, w), Math.min(900, window.innerWidth - 40)));
  const [typing, setTyping] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [welcomed, setWelcomed] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [full, setFull] = useState(fullPage);
  const [kwDraft, setKwDraft] = useState("");
  const [chanEdit, setChanEdit] = useState<Partial<ChatChannel> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const lastTyping = useRef(0);

  // preferences on this device
  useEffect(() => {
    setChatStyle(readLocal("chatStyle", "bubbles"));
    setDock(readLocal("chatDock", "float"));
    setPreviews(readLocal("chatPreviews", true));
    // older versions kept a plain list of muted channels
    const old = readLocal<string[]>("chatMuted", []);
    setMuteUntil({ ...Object.fromEntries(old.map((c) => [c, 0])), ...readLocal<Record<string, number>>("chatMute", {}) });
    setRecentEmoji(readLocal("recentEmoji", []));
    setWelcomed(readLocal("chatWelcomed", false));
  }, []);

  const messages = useMemo(
    () => (blocked.length ? s.messages.filter((m) => !blocked.includes(m.user.toLowerCase())) : s.messages),
    [s.messages, blocked]
  );
  const hiddenCount = s.messages.length - messages.length;
  const current = s.channels.find((c) => c.id === channel);
  const me = user?.toLowerCase();

  const load = useCallback(async (ch?: string) => {
    try {
      const res = await fetch(`/api/chat?ch=${encodeURIComponent(ch || channelRef.current)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // a club channel you've left, or one that was removed: back to #general
        if (ch !== "general") { channelRef.current = "general"; load("general"); }
        return;
      }
      setLoadedOnce(true);
      setLoadFailed(false);
      setS((prev) => ({
        channel: json.channel || prev.channel,
        messages: Array.isArray(json.messages) ? json.messages : prev.messages,
        hasMore: !!json.hasMore,
        roles: json.roles || prev.roles,
        pins: json.pins || [],
        channels: json.channels || prev.channels,
        keywords: json.keywords || [],
        shortcodes: json.shortcodes || {},
        maxLen: json.maxLen || 500,
        notifyLevels: json.notifyLevels || prev.notifyLevels,
        images: json.images !== false,
      }));
    } catch {
      // network blip — say so (with a retry) if nothing has loaded yet
      setLoadFailed(true);
    }
  }, []);
  const channelRef = useRef("general");
  useEffect(() => { channelRef.current = channel; }, [channel]);

  // load once, then only when the shared poll says chat changed
  useEffect(() => { load(); }, [load]);
  useOnRevChange("chat", () => load());
  // poll at full speed while the panel is open, even if you're just reading
  useEffect(() => (open ? holdFast() : undefined), [open]);

  // who's typing (only while the panel is open)
  useEffect(() => {
    if (!open) { setTyping([]); return; }
    let live = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/chat?ch=${channel}&typing=1`, { cache: "no-store" }).then((r) => r.json()).then((j) => live && setTyping(j.typing || [])).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => { live = false; clearInterval(id); };
  }, [open, channel]);

  // links / notifications can point at a channel and message
  useEffect(() => {
    if (!target) return;
    if (target.channel && target.channel !== channelRef.current) switchChannel(target.channel);
    if (target.msg) {
      setHighlight(target.msg);
      setTimeout(() => {
        document.querySelector(`[data-msg-id="${target.msg}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 600);
      setTimeout(() => setHighlight(null), 3000);
    }
    if (target.reply) {
      const m = s.messages.find((x) => x.id === target.reply);
      if (m) setReplyTo(m);
    }
    if (target.text) setText(target.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ping when someone @mentions you while chat is closed
  useEffect(() => {
    if (!messages.length) return;
    if (seenIds.current && user && !open && s.notifyLevels[channel] !== "none") {
      const fresh = messages.filter((m) => !seenIds.current!.has(m.id) && m.user !== user && mentions(m.text, user));
      if (fresh.length && !quiet) {
        showToast(`💬 ${fresh[fresh.length - 1].user} mentioned you in #${current?.name || channel}`);
        onMention?.();
      }
    }
    seenIds.current = new Set(messages.map((m) => m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, user, open]);

  const newestId = messages[messages.length - 1]?.id ?? null;
  const [dividerId, setDividerId] = useState<string | null>(null);
  useEffect(() => {
    // remember where you'd read up to, for the "New messages" line
    if (open) { setDividerId(lastSeenId); setLastSeenId(newestId); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => { if (open) setLastSeenId(newestId); }, [open, newestId]);
  useEffect(() => { if (lastSeenId === null && newestId) setLastSeenId(newestId); }, [lastSeenId, newestId]);
  useEffect(() => {
    const el = listRef.current;
    if (open && el && !scrolledUp) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, newestId, channel]);

  const lastSeenIndex = messages.findIndex((m) => m.id === lastSeenId);
  const unreadList = lastSeenIndex >= 0 ? messages.slice(lastSeenIndex + 1) : [];
  const level = s.notifyLevels[channel] || "all";
  const unread = open || muted.includes(channel) || level === "none" ? 0
    : level === "mentions" ? unreadList.filter((m) => mentions(m.text, user)).length : unreadList.length;
  const mentioned = !open && unreadList.some((m) => mentions(m.text, user));
  const unreadMentions = messages.filter((m) => mentions(m.text, user) && m.user !== user && dividerId && messages.findIndex((x) => x.id === dividerId) < messages.indexOf(m));

  const dividerIndex = dividerId ? messages.findIndex((m) => m.id === dividerId) : -1;
  const newSinceDivider = dividerIndex >= 0 ? messages.slice(dividerIndex + 1).filter((m) => m.user !== user).length : 0;
  useEffect(() => { setDividerSeen(false); }, [dividerId]);
  /** Is the "New messages" line on screen? Then there's nothing to jump to. */
  const checkDivider = useCallback(() => {
    const list = listRef.current;
    const line = list?.querySelector(".chat-new-line");
    if (!list || !line) return;
    const a = list.getBoundingClientRect();
    const b = line.getBoundingClientRect();
    if (b.bottom >= a.top && b.top <= a.bottom) setDividerSeen(true);
  }, []);
  useEffect(() => { if (open) { const t = setTimeout(checkDivider, 150); return () => clearTimeout(t); } }, [open, dividerId, newestId, checkDivider]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ch: channel, ...body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Could not send");
    if (Array.isArray(json.messages)) setS((prev) => ({ ...prev, messages: json.messages, hasMore: json.hasMore ?? prev.hasMore, pins: json.pins || prev.pins }));
    if (json.channels) setS((prev) => ({ ...prev, channels: json.channels }));
    return json;
  }

  function switchChannel(ch: string) {
    // keep a half-written message per channel
    writeLocal(`chatDraft:${channelRef.current}`, text);
    channelRef.current = ch;
    setS((prev) => ({ ...prev, channel: ch, messages: [], pins: [], hasMore: false }));
    setText(readLocal(`chatDraft:${ch}`, ""));
    setReplyTo(null);
    setEditing(null);
    setThreadOf(null);
    setScrolledUp(false);
    load(ch);
  }

  async function loadOlder() {
    const first = s.messages[0];
    if (!first) return;
    const el = listRef.current;
    const before = el?.scrollHeight || 0;
    const j = await fetch(`/api/chat?ch=${channel}&before=${first.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j?.messages) return;
    setS((prev) => ({ ...prev, messages: [...j.messages, ...prev.messages], hasMore: !!j.hasMore }));
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user) { onNeedLogin(); return; }
    const body = applyShortcodes(text, s.shortcodes).trim();
    if ((!body && !image) || sending) return;
    setSending(true);
    try {
      if (editing) {
        await post({ action: "edit", id: editing.id, text: body });
        setEditing(null);
      } else {
        await post({ text: body, replyTo: replyTo?.id, ...(image ? { image } : {}) });
        if (image && !canModerate) showToast("Picture sent — others see it once a moderator has checked it");
        setImage(null);
      }
      setText("");
      writeLocal(`chatDraft:${channel}`, "");
      setReplyTo(null);
      setEmojiOpen(false);
      setScrolledUp(false);
    } catch (err: any) {
      showToast(humanError(err, "Couldn't send that"));
      if (err.message === "Log in to chat") onNeedLogin();
    } finally {
      setSending(false);
    }
  }

  async function act(body: Record<string, unknown>, done?: string) {
    if (!user) { onNeedLogin(); return; }
    try { await post(body); if (done) showToast(done); } catch (err: any) { showToast(err.message); }
  }

  function onType(v: string) {
    setText(v);
    // "@link maths" picks one of the site's websites; ":smi" finds an emoji; "@na" a person
    const lk = siteLinks.length ? /(^|\s)@link(?:\s+([^\n@]{0,40}))?$/i.exec(v) : null;
    setLinkQ(lk ? (lk[2] || "").trim().toLowerCase() : null);
    const em = !lk ? /(^|\s):([a-z0-9_+-]{2,20})$/i.exec(v) : null;
    setEmojiQ(em ? em[2].toLowerCase() : null);
    setSugIdx(0);
    // @mention autocomplete
    const m = !lk ? /(^|\s)@([A-Za-z0-9_]{0,20})$/.exec(v) : null;
    setMentionQ(m ? m[2].toLowerCase() : null);
    setMentionIdx(0);
    if (m && !people.length) {
      fetch("/api/people").then((r) => r.json()).then((j) => setPeople((j.people || []).map((p: { username: string }) => p.username))).catch(() => {});
    }
    // let others see you're typing (at most every 3 seconds)
    if (user && Date.now() - lastTyping.current > 3000 && v.trim()) {
      lastTyping.current = Date.now();
      fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "typing", ch: channel }) }).catch(() => {});
    }
  }
  const mentionOptions = useMemo(() => {
    if (mentionQ === null) return [];
    const pool = Array.from(new Set([...online, ...s.messages.map((m) => m.user), ...people])).filter((u) => u.toLowerCase() !== me);
    return pool.filter((u) => u.toLowerCase().startsWith(mentionQ)).slice(0, 6);
  }, [mentionQ, online, s.messages, people, me]);
  const linkOptions = useMemo(() => {
    if (linkQ === null) return [];
    const words = linkQ.split(/\s+/).filter(Boolean);
    return siteLinks.filter((l) => words.every((w) => `${l.name} ${l.url} ${l.folder}`.toLowerCase().includes(w))).slice(0, 6);
  }, [linkQ, siteLinks]);
  const emojiOptions = useMemo(() => {
    if (emojiQ === null) return [];
    const all = { ...SHORTCODES, ...s.shortcodes };
    return Object.entries(all).filter(([k]) => k.startsWith(emojiQ)).slice(0, 6);
  }, [emojiQ, s.shortcodes]);
  function pickLink(l: KnownLink) {
    setText((t) => t.replace(/@link(?:\s+[^\n@]{0,40})?$/i, `${l.url} `));
    setLinkQ(null);
    inputRef.current?.focus();
  }
  function pickEmoji(em: string) {
    setText((t) => t.replace(/:([a-z0-9_+-]{2,20})$/i, em));
    setEmojiQ(null);
    const next = [em, ...recentEmoji.filter((x) => x !== em)].slice(0, 24);
    setRecentEmoji(next);
    writeLocal("recentEmoji", next);
    inputRef.current?.focus();
  }
  async function attach(file: File | undefined | null) {
    if (!file) return;
    if (!s.images && !canModerate) { showToast("Pictures are turned off in chat"); return; }
    setImageBusy(true);
    try { setImage(await shrinkImage(file, 1280)); inputRef.current?.focus(); }
    catch (e: any) { showToast(e.message || "Couldn't use that picture"); }
    finally { setImageBusy(false); }
  }

  function pickMention(name: string) {
    setText((t) => t.replace(/@([A-Za-z0-9_]{0,20})$/, `@${name} `));
    setMentionQ(null);
    inputRef.current?.focus();
  }

  function mention(name: string) {
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${name} `);
    inputRef.current?.focus();
  }
  function quote(m: ChatMessage) {
    setText((t) => `> ${m.user}: ${m.text.split("\n")[0].slice(0, 140)}\n${t}`);
    inputRef.current?.focus();
  }
  function startEdit(m: ChatMessage) {
    setEditing(m);
    setReplyTo(null);
    setText(m.text);
    inputRef.current?.focus();
  }
  function addEmoji(em: string) {
    setText((t) => t + em);
    const next = [em, ...recentEmoji.filter((x) => x !== em)].slice(0, 24);
    setRecentEmoji(next);
    writeLocal("recentEmoji", next);
    inputRef.current?.focus();
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQ.trim()) return;
    const j = await fetch(`/api/chat?q=${encodeURIComponent(searchQ.trim())}`).then((r) => r.json()).catch(() => ({}));
    setResults(j.results || []);
  }

  const savePref = <T,>(key: string, set: (v: T) => void) => (v: T) => { set(v); writeLocal(key, v); };
  const setStyle = savePref<ChatStyle>("chatStyle", setChatStyle);
  const setDockPref = savePref<Dock>("chatDock", setDock);
  const setPrev = savePref<boolean>("chatPreviews", setPreviews);
  /** Mute this channel for a while (0 = until you unmute; null = unmute). */
  const muteFor = (until: number | null) => {
    const next = { ...muteUntil };
    if (until === null) delete next[channel]; else next[channel] = until;
    // forget mutes that have run out
    for (const [c, t] of Object.entries(next)) if (t && t < Date.now()) delete next[c];
    setMuteUntil(next);
    writeLocal("chatMute", next);
    writeLocal("chatMuted", []);
    const name = `#${current?.name || channel}`;
    showToast(until === null ? `Unmuted ${name}` : until === 0 ? `Muted ${name}` : `Muted ${name} until ${new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${new Date(until).getDate() !== new Date().getDate() ? " tomorrow" : ""}`);
  };
  const tomorrowMorning = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return d.getTime(); };
  const setLevel = async (lvl: "all" | "mentions" | "none") => {
    setS((prev) => ({ ...prev, notifyLevels: { ...prev.notifyLevels, [channel]: lvl } }));
    try { await post({ action: "notifyLevel", level: lvl }); } catch (e: any) { showToast(e.message); }
  };

  const faceMap = useFaces();
  const myLast = [...messages].reverse().find((m) => m.user === user && (!m.kind || m.kind === "text" || m.kind === "me"));
  const threadMessages = threadOf ? messages.filter((m) => m.replyTo?.id === threadOf.id) : [];
  const shown = threadOf ? [threadOf, ...threadMessages] : messages;
  const counter = text.length > s.maxLen * 0.8;

  function renderMessage(m: ChatMessage, i: number, list: ChatMessage[]) {
    // their profile colour tints the bubble
    const tint = !m.kind ? faceMap?.[m.user.toLowerCase()]?.c : undefined;
    const mine = m.user === user;
    const prev = list[i - 1];
    const grouped = !!prev && prev.user === m.user && !m.replyTo && !m.kind && !prev.kind
      && new Date(m.at).getTime() - new Date(prev.at).getTime() < 120000 && dayLabel(prev.at) === dayLabel(m.at);
    const reactions = Object.entries(m.reactions || {});
    const role = s.roles[m.user.toLowerCase()];
    const staffMsg = role === "owner" || role === "admin";
    const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
    const divider = !threadOf && dividerId && prev?.id === dividerId && m.user !== user;
    const totalVotes = m.poll ? Object.values(m.poll.votes || {}).reduce((n, v) => n + v.length, 0) : 0;
    const myVote = m.poll ? Object.entries(m.poll.votes || {}).find(([, v]) => me && v.includes(me))?.[0] : undefined;
    return (
      <Fragment key={m.id}>
        {newDay && <div className="chat-day"><span>{dayLabel(m.at)}</span></div>}
        {divider && <div className="chat-new-line"><span>New messages</span></div>}
        <div
          data-msg-id={m.id}
          className={`chat-msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""} ${mentions(m.text, user) ? "mentioned" : ""} ${m.kind ? `kind-${m.kind}` : ""} ${staffMsg ? "staff" : ""} ${highlight === m.id ? "highlight" : ""} ${tint ? "tinted" : ""}`}
          style={tint ? ({ "--pc": tint } as React.CSSProperties) : undefined}
        >
          {!grouped && (
            <div className="chat-meta">
              <UserChip username={m.user} role={role} online={online.includes(m.user)} className="chat-user" onOpen={mention} face />
              {role && role !== "mod" && <span className={`pill role-${role}`}>{role}</span>}
              <span className="muted" title={new Date(m.at).toLocaleString()}>{timeLabel(m.at)}</span>
              {m.edited && <span className="muted">(edited)</span>}
              {m.answered && <span className="pill approved">✓ answered</span>}
            </div>
          )}
          <div className="chat-bubble-row">
            <div className="chat-text" onClick={() => setMenuFor(null)}>
              {m.replyTo && (
                <button className="chat-quote" onClick={() => { setHighlight(m.replyTo!.id); document.querySelector(`[data-msg-id="${m.replyTo!.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => setHighlight(null), 1500); }}>
                  <Icon name="reply" /> <strong>{m.replyTo.user}</strong> {m.replyTo.text}
                </button>
              )}
              {m.kind === "me" ? <em className="chat-me">{m.user} {m.text}</em>
                : m.kind === "poll" && m.poll ? (
                  <div className="chat-poll">
                    <strong>📊 {m.poll.question}</strong>
                    {m.poll.options.map((o, oi) => {
                      const n = m.poll!.votes?.[oi]?.length || 0;
                      const pct = totalVotes ? Math.round((n / totalVotes) * 100) : 0;
                      return (
                        <button key={oi} className={`poll-opt ${myVote === String(oi) ? "mine" : ""}`} onClick={() => act({ action: "vote", id: m.id, option: oi })}>
                          <span className="poll-fill" style={{ width: `${pct}%` }} />
                          <span className="poll-label">{myVote === String(oi) && <Icon name="check" />} {o}</span>
                          <span className="poll-pct">{n}</span>
                        </button>
                      );
                    })}
                    <span className="muted">{totalVotes} vote{totalVotes === 1 ? "" : "s"} · tap again to take yours back</span>
                  </div>
                ) : m.text ? <ChatText text={m.text} me={user} known={known} previews={previews} /> : null}
              {m.img && (m.imgPending && !mine && !canModerate ? (
                <span className="chat-img-wait">🖼️ A picture — waiting for a moderator</span>
              ) : (
                <a className="chat-img-link" href={`/api/img/${m.img}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  <img className="chat-img" src={`/api/img/${m.img}`} alt={`Picture from ${m.user}`} loading="lazy" onLoad={() => { const el = listRef.current; if (el && !scrolledUp) el.scrollTop = el.scrollHeight; }} />
                  {m.imgPending && <span className="chat-img-note">Waiting for a moderator — only you{mine ? "" : " (and staff)"} can see it</span>}
                </a>
              ))}
            </div>
            <div className="msg-tools">
              <button title="React" onClick={(e) => { e.stopPropagation(); setPicker(picker === m.id ? null : m.id); setMenuFor(null); }}>😊</button>
              <button title="Reply" onClick={() => { setReplyTo(m); setEditing(null); inputRef.current?.focus(); }}><Icon name="reply" /></button>
              <button title="More" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === m.id ? null : m.id); setPicker(null); }}><Icon name="more" /></button>
            </div>
          </div>
          {menuFor === m.id && (
            <div className="msg-menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { quote(m); setMenuFor(null); }}><Icon name="quote" /> Quote</button>
              <button onClick={() => { setThreadOf(m); setMenuFor(null); }}><Icon name="chat" /> Thread{m.replies ? ` (${m.replies})` : ""}</button>
              <button onClick={() => { navigator.clipboard.writeText(m.text).then(() => showToast("Copied")).catch(() => {}); setMenuFor(null); }}><Icon name="copy" /> Copy text</button>
              <button onClick={() => { navigator.clipboard.writeText(`${location.origin}/?chat=open&ch=${channel}&msg=${m.id}`).then(() => showToast("Link to message copied")).catch(() => {}); setMenuFor(null); }}><Icon name="link" /> Copy link</button>
              {user && onSave && <button onClick={() => { onSave(m, !savedIds.has(m.id)); setMenuFor(null); }}><Icon name="star" /> {savedIds.has(m.id) ? "Unsave" : "Save for later"}</button>}
              {mine && (!m.kind || m.kind === "text" || m.kind === "me") && <button onClick={() => { startEdit(m); setMenuFor(null); }}><Icon name="edit" /> Edit</button>}
              {(current?.id === "help" || m.answered) && (mine || canModerate) && (
                <button onClick={() => { act({ action: "answer", id: m.id, answered: !m.answered }, m.answered ? "Marked unanswered" : "Marked answered ✓"); setMenuFor(null); }}><Icon name="check" /> {m.answered ? "Not answered" : "Mark answered"}</button>
              )}
              {canModerate && <button onClick={() => { act({ action: "pin", id: m.id, pinned: !s.pins.some((p) => p.id === m.id) }, s.pins.some((p) => p.id === m.id) ? "Unpinned" : "Pinned"); setMenuFor(null); }}><Icon name="pin" /> {s.pins.some((p) => p.id === m.id) ? "Unpin" : "Pin"}</button>}
              {(mine || canModerate) && <button className="danger" onClick={async () => {
                setMenuFor(null);
                if (!mine) { if (confirm("Delete this message for everyone?")) act({ action: "delete", id: m.id, password: adminPassword || undefined }); return; }
                // your own: no "are you sure", just an Undo (which sends it again)
                try {
                  await post({ action: "delete", id: m.id });
                  if (!m.kind && m.text && !m.img) showToast("Message deleted", { label: "Undo", run: () => { post({ text: m.text, replyTo: m.replyTo?.id }).catch((err: any) => showToast(err.message)); } });
                  else showToast("Message deleted");
                } catch (err: any) { showToast(err.message); }
              }}><Icon name="trash" /> Delete</button>}
              {user && onBlock && !mine && <button onClick={() => { if (confirm(`Hide all messages from ${m.user}? You can undo this in Account & security.`)) onBlock(m.user); setMenuFor(null); }}><Icon name="eyeOff" /> Block {m.user}</button>}
              {user && !mine && (
                <button onClick={async () => {
                  setMenuFor(null);
                  const reason = window.prompt(`What's wrong with this message from ${m.user}?`, "");
                  if (!reason?.trim()) return;
                  const res = await fetch("/api/reports", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind: "message", targetId: m.id, targetName: `${m.user}: ${m.text.slice(0, 80)}`, reason, extra: `${channel}: ${m.text.slice(0, 200)}` }),
                  });
                  const j = await res.json().catch(() => ({}));
                  showToast(res.ok ? "Thanks — a moderator will take a look" : j.error || "Couldn't send the report");
                }}>🚩 Report</button>
              )}
            </div>
          )}
          {picker === m.id && (
            <div className="reaction-picker" onClick={(e) => e.stopPropagation()}>
              {REACTIONS.map((r) => <button key={r} onClick={() => { setPicker(null); act({ action: "react", id: m.id, emoji: r }); }}>{r}</button>)}
            </div>
          )}
          {(reactions.length > 0 || (m.replies && !threadOf)) && (
            <div className="reactions">
              {reactions.map(([emoji, users]) => (
                <button key={emoji} className={me && users.includes(me) ? "on" : ""} onClick={() => act({ action: "react", id: m.id, emoji })} title={`${users.join(", ")} reacted ${emoji}`}>
                  {emoji} {users.length}
                </button>
              ))}
              {m.replies && !threadOf ? <button className="thread-btn" onClick={() => setThreadOf(m)}>💬 {m.replies} repl{m.replies === 1 ? "y" : "ies"}</button> : null}
            </div>
          )}
        </div>
      </Fragment>
    );
  }

  const panel = (
    <aside className={`chat-panel style-${chatStyle} ${dock === "side" && !full ? "docked" : ""} ${full ? "full" : ""}`} aria-label="Chat" style={width && !full && !fullPage ? { width } : undefined}>
      {!full && !fullPage && (
        <div
          className="chat-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Chat width — drag, or use the arrow keys"
          title="Drag to resize (double-click to reset)"
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => { setWidth(null); writeLocal("chatWidth", null); }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const cur = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width;
            const next = clampWidth(cur + (e.key === "ArrowLeft" ? 30 : -30));
            setWidth(next);
            writeLocal("chatWidth", next);
          }}
        />
      )}
      <div className="chat-header">
        <div className="chat-title">
          <select className="chat-channel-select" value={channel} onChange={(e) => switchChannel(e.target.value)} aria-label="Channel">
            {s.channels.filter((c) => !c.clubId).map((c) => <option key={c.id} value={c.id}>{c.emoji} #{c.name}{muted.includes(c.id) ? " (muted)" : ""}</option>)}
            {s.channels.some((c) => c.clubId) && (
              <optgroup label="Clubs">
                {s.channels.filter((c) => c.clubId).map((c) => <option key={c.id} value={c.id}>{c.emoji} #{c.name}</option>)}
              </optgroup>
            )}
          </select>
          <div className="chat-online" title={online.join(", ")}>
            <span className="live-dot" /> {current?.topic || (online.length ? `${online.length} online` : "nobody else logged in")}
          </div>
        </div>
        <div className="chat-head-actions">
          <button className={`btn-icon sm ${searchOpen ? "on" : ""}`} title="Search messages" onClick={() => { setSearchOpen(!searchOpen); setResults(null); }}><Icon name="search" /></button>
          {onOpenClubs && <button className="btn-icon sm" title="Clubs" onClick={onOpenClubs}><Icon name="users" /></button>}
          <button className={`btn-icon sm ${settingsOpen ? "on" : ""}`} title="Chat settings" onClick={() => setSettingsOpen(!settingsOpen)}><Icon name="settings" /></button>
          {!fullPage && <button className="btn-icon sm" title={full ? "Smaller" : "Full screen"} onClick={() => setFull(!full)}><Icon name={full ? "down" : "up"} /></button>}
          {!fullPage && <button className="btn-icon sm" title="Pop out into its own window" onClick={() => window.open("/chat", "chat", "width=420,height=720")}><Icon name="external" /></button>}
        </div>
      </div>

      {settingsOpen && (
        <div className="chat-settings">
          <div className="seg mini">
            <button className={chatStyle === "bubbles" ? "on" : ""} onClick={() => setStyle("bubbles")}>Bubbles</button>
            <button className={chatStyle === "compact" ? "on" : ""} onClick={() => setStyle("compact")}>Compact</button>
          </div>
          {!fullPage && (
            <div className="seg mini">
              <button className={dock === "float" ? "on" : ""} onClick={() => setDockPref("float")}>Floating</button>
              <button className={dock === "side" ? "on" : ""} onClick={() => setDockPref("side")}>Docked on the side</button>
            </div>
          )}
          <label className="check remember"><input type="checkbox" checked={previews} onChange={(e) => setPrev(e.target.checked)} /> Show link previews</label>
          {user && (
            <div className="chat-notify">
              <span className="muted">Notify me about #{current?.name || channel}:</span>
              <div className="seg mini">
                {([["all", "Everything"], ["mentions", "@mentions"], ["none", "Nothing"]] as const).map(([v, l]) => (
                  <button key={v} className={level === v ? "on" : ""} onClick={() => setLevel(v)}>{l}</button>
                ))}
              </div>
            </div>
          )}
          <div className="chat-notify">
            {muted.includes(channel) ? (
              <>
                <span className="muted">🔕 Muted{muteUntil[channel] ? ` until ${new Date(muteUntil[channel]).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}</span>
                <button className="link-btn" onClick={() => muteFor(null)}>Unmute</button>
              </>
            ) : (
              <>
                <span className="muted">Mute:</span>
                <div className="seg mini">
                  <button onClick={() => muteFor(Date.now() + 3600_000)}>1 hour</button>
                  <button onClick={() => muteFor(Date.now() + 8 * 3600_000)}>8 hours</button>
                  <button onClick={() => muteFor(tomorrowMorning())}>Until tomorrow</button>
                  <button onClick={() => muteFor(0)}>Until I unmute</button>
                </div>
              </>
            )}
          </div>
          {user && (
            <form className="chat-kw" onSubmit={(e) => { e.preventDefault(); const w = kwDraft.trim(); if (!w) return; act({ action: "keywords", words: [...s.keywords, w] }, `You'll be told when someone says “${w}”`); setKwDraft(""); load(); }}>
              <span className="muted">Tell me when someone says:</span>
              <div className="chip-grid">
                {s.keywords.map((k) => <span key={k} className="pick">{k}<button type="button" className="ss-x" title={`Stop watching for “${k}”`} aria-label={`Stop watching for ${k}`} onClick={() => { act({ action: "keywords", words: s.keywords.filter((x) => x !== k) }); load(); }}>×</button></span>)}
                <input value={kwDraft} onChange={(e) => setKwDraft(e.target.value)} placeholder="a word…" maxLength={30} />
              </div>
            </form>
          )}
          {user && <a className="link-btn" href="/api/chat?mine=1" download>Download my messages</a>}
          {isAdmin && (
            <button className="link-btn" onClick={() => setChanEdit({ ...current })}>Channel settings (topic, rules, slow mode)…</button>
          )}
          {isAdmin && <button className="link-btn" onClick={() => setChanEdit({ name: "", emoji: "💬" })}>New channel…</button>}
        </div>
      )}

      {chanEdit && (
        <form className="chat-settings chan-edit" onSubmit={async (e) => {
          e.preventDefault();
          try { await post({ action: "saveChannel", channel: chanEdit }); showToast("Channel saved"); setChanEdit(null); load(); } catch (err: any) { showToast(err.message); }
        }}>
          <div className="status-row">
            <input className="emoji-in" value={chanEdit.emoji || ""} onChange={(e) => setChanEdit({ ...chanEdit, emoji: e.target.value })} maxLength={8} aria-label="Emoji" />
            <input value={chanEdit.name || ""} onChange={(e) => setChanEdit({ ...chanEdit, name: e.target.value })} placeholder="channel-name" disabled={!!chanEdit.id} />
          </div>
          <input value={chanEdit.topic || ""} onChange={(e) => setChanEdit({ ...chanEdit, topic: e.target.value })} placeholder="Topic (one line)" maxLength={120} />
          <textarea value={chanEdit.rules || ""} onChange={(e) => setChanEdit({ ...chanEdit, rules: e.target.value })} placeholder="Rules shown at the top (optional)" maxLength={600} />
          <label className="muted">Slow mode: {chanEdit.slow || 0}s between messages
            <input type="range" min={0} max={120} step={5} value={chanEdit.slow || 0} onChange={(e) => setChanEdit({ ...chanEdit, slow: Number(e.target.value) })} />
          </label>
          <div className="row-edit-actions">
            {chanEdit.id && !["general", "help", "random"].includes(chanEdit.id) && !chanEdit.clubId && (
              <button type="button" className="btn btn-danger btn-sm" onClick={async () => { if (confirm(`Remove #${chanEdit.name} and its messages?`)) { await post({ action: "removeChannel", ch: chanEdit.id }); setChanEdit(null); switchChannel("general"); } }}>Remove</button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setChanEdit(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm">Save</button>
          </div>
        </form>
      )}

      {searchOpen && (
        <form className="chat-search" onSubmit={runSearch}>
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search all channels…" autoFocus />
          {results && (
            <div className="chat-results">
              {results.length === 0 && <div className="muted">No messages match.</div>}
              {results.map((r) => (
                <button key={r.id} type="button" className="chat-result" onClick={() => { setSearchOpen(false); if (r.channel && r.channel !== channel) switchChannel(r.channel); setTimeout(() => { setHighlight(r.id); document.querySelector(`[data-msg-id="${r.id}"]`)?.scrollIntoView({ block: "center" }); }, 500); setTimeout(() => setHighlight(null), 3000); }}>
                  <strong>{r.user}</strong> <span className="muted">#{s.channels.find((c) => c.id === r.channel)?.name || r.channel} · {timeLabel(r.at)}</span>
                  <span>{r.text.slice(0, 100)}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      )}

      {current?.rules && (
        <button className={`chat-rules ${rulesOpen ? "open" : ""}`} onClick={() => setRulesOpen(!rulesOpen)}>
          📜 Channel rules{rulesOpen ? <span className="rules-text">{current.rules}</span> : <span className="muted"> — tap to read</span>}
        </button>
      )}
      {s.pins.length > 0 && !threadOf && (
        <div className="chat-pins">
          {s.pins.map((p) => (
            <button key={p.id} className="chat-pin" onClick={() => { setHighlight(p.id); document.querySelector(`[data-msg-id="${p.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => setHighlight(null), 2000); }}>
              <Icon name="pin" /> <strong>{p.user}:</strong> {p.text.slice(0, 80)}
            </button>
          ))}
        </div>
      )}
      {threadOf && (
        <div className="chat-thread-bar">
          <button className="link-btn" onClick={() => setThreadOf(null)}>← Back to #{current?.name || channel}</button>
          <span className="muted">Thread · {threadMessages.length} repl{threadMessages.length === 1 ? "y" : "ies"}</span>
        </div>
      )}

      <div
        className="chat-list"
        ref={listRef}
        onClick={() => { setPicker(null); setMenuFor(null); }}
        onScroll={(e) => { const el = e.currentTarget; setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 120); if (!dividerSeen) checkDivider(); }}
      >
        {!threadOf && s.hasMore && <button className="btn btn-secondary btn-sm load-older" onClick={loadOlder}>Load older messages</button>}
        {!welcomed && user && (
          <div className="chat-welcome">
            <strong>👋 Welcome to chat!</strong>
            <span>Be kind. Use @name to get someone&apos;s attention, /roll for dice, /poll Question | A | B to vote. **bold**, *italic*, ||spoilers|| and $x^2$ work.</span>
            <button className="link-btn" onClick={() => { setWelcomed(true); writeLocal("chatWelcomed", true); }}>Got it</button>
          </div>
        )}
        {!loadedOnce && loadFailed && <div className="load-error">Couldn&apos;t load the chat — check your internet. <button className="btn btn-secondary btn-sm" onClick={() => load()}>Try again</button></div>}
        {!loadedOnce && !loadFailed && <div className="chat-loading" aria-label="Loading messages">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}</div>}
        {loadedOnce && shown.length === 0 && <div className="chat-empty">No messages here yet. Say hi! 👋</div>}
        {hiddenCount > 0 && <div className="chat-hidden-note">{hiddenCount} message{hiddenCount === 1 ? "" : "s"} from people you blocked are hidden</div>}
        {shown.map((m, i) => renderMessage(m, i, shown))}
      </div>
      {(scrolledUp || unreadMentions.length > 0 || (newSinceDivider > 0 && !dividerSeen && !threadOf)) && open && (
        <div className="chat-jumps">
          {newSinceDivider > 0 && !dividerSeen && !threadOf && (
            <button className="btn btn-secondary btn-sm" onClick={() => { listRef.current?.querySelector(".chat-new-line")?.scrollIntoView({ block: "start", behavior: "smooth" }); setDividerSeen(true); }}>
              ↑ {newSinceDivider} new message{newSinceDivider === 1 ? "" : "s"}
            </button>
          )}
          {unreadMentions.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => { const m = unreadMentions[0]; document.querySelector(`[data-msg-id="${m.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); setHighlight(m.id); setTimeout(() => setHighlight(null), 1500); setDividerId(m.id); }}>
              @ {unreadMentions.length} mention{unreadMentions.length === 1 ? "" : "s"}
            </button>
          )}
          {scrolledUp && <button className="btn btn-secondary btn-sm" onClick={() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; setScrolledUp(false); }}>↓ Latest</button>}
        </div>
      )}
      {typing.length > 0 && <div className="chat-typing">{typing.slice(0, 3).join(", ")} {typing.length === 1 ? "is" : "are"} typing…</div>}

      {!chatEnabled ? (
        <div className="chat-form chat-off">Chat has been turned off by an admin.</div>
      ) : user ? (
        <form
          className="chat-compose"
          onSubmit={send}
          onDragOver={(e) => { if (s.images && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault(); }}
          onDrop={(e) => { const file = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("image/")); if (file) { e.preventDefault(); attach(file); } }}
        >
          {(replyTo || editing) && (
            <div className="reply-bar">
              <Icon name={editing ? "edit" : "reply"} /> {editing ? "Editing your message" : <>Replying to <strong>{replyTo!.user}</strong></>}
              <span className="reply-snippet">{(editing || replyTo)!.text}</span>
              <button type="button" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }} aria-label="Cancel" title="Cancel"><Icon name="x" /></button>
            </div>
          )}
          {linkOptions.length > 0 && (
            <div className="mention-menu link-menu">
              {linkOptions.map((l, i) => (
                <button type="button" key={l.url} className={i === sugIdx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pickLink(l); }}>
                  {l.emoji} <strong>{l.name}</strong> <span className="muted">{l.folder}</span>
                </button>
              ))}
            </div>
          )}
          {linkQ !== null && !linkOptions.length && <div className="mention-menu"><span className="muted">No website matches “{linkQ}”</span></div>}
          {emojiOptions.length > 0 && (
            <div className="mention-menu">
              {emojiOptions.map(([k, em], i) => (
                <button type="button" key={k} className={i === sugIdx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pickEmoji(em); }}>{em} :{k}:</button>
              ))}
            </div>
          )}
          {image && (
            <div className="chat-attach">
              <img src={image} alt="Picture to send" />
              <span className="muted">{canModerate ? "Picture ready" : "Picture ready — a moderator checks it before others see it"}</span>
              <button type="button" className="ss-x" onClick={() => setImage(null)} aria-label="Remove picture" title="Remove picture">×</button>
            </div>
          )}
          {mentionOptions.length > 0 && (
            <div className="mention-menu">
              {mentionOptions.map((u, i) => (
                <button type="button" key={u} className={i === mentionIdx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}>@{u}{online.includes(u) && <span className="mini-dot" />}</button>
              ))}
            </div>
          )}
          {emojiOpen && <EmojiPicker onPick={addEmoji} recent={recentEmoji} />}
          <div className="chat-form">
            <button type="button" className="emoji-toggle" onClick={() => setEmojiOpen((o) => !o)} title="Emoji">😀</button>
            {s.images && !editing && (
              <>
                <button type="button" className="emoji-toggle" disabled={imageBusy} onClick={() => fileRef.current?.click()} title="Send a picture (or paste one)">{imageBusy ? "…" : "📎"}</button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} />
              </>
            )}
            {siteLinks.length > 0 && !editing && (
              <button type="button" className="emoji-toggle" title="Share one of the site's websites" onClick={() => { setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@link `); setLinkQ(""); inputRef.current?.focus(); }}>🔗</button>
            )}
            <textarea
              ref={inputRef}
              value={text}
              rows={1}
              onChange={(e) => onType(e.target.value)}
              onPaste={(e) => {
                const file = Array.from(e.clipboardData?.files || []).find((f) => f.type.startsWith("image/"));
                if (file && !editing) { e.preventDefault(); attach(file); }
              }}
              placeholder={editing ? "Edit your message…" : replyTo ? `Reply to ${replyTo.user}…` : `Message #${current?.name || channel} — @name, /roll, :fire:`}
              maxLength={s.maxLen}
              autoFocus={!fullPage}
              onKeyDown={(e) => {
                const sug = linkOptions.length || emojiOptions.length;
                if (sug) {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => (i + 1) % sug); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => (i - 1 + sug) % sug); return; }
                  if (e.key === "Tab" || e.key === "Enter") {
                    e.preventDefault();
                    if (linkOptions.length) pickLink(linkOptions[sugIdx] || linkOptions[0]); else pickEmoji((emojiOptions[sugIdx] || emojiOptions[0])[1]);
                    return;
                  }
                  if (e.key === "Escape") { e.stopPropagation(); setLinkQ(null); setEmojiQ(null); return; }
                }
                if (mentionOptions.length) {
                  if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionOptions.length); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return; }
                  if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); pickMention(mentionOptions[mentionIdx]); return; }
                }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); return; }
                if (e.key === "ArrowUp" && !text && myLast) { e.preventDefault(); startEdit(myLast); return; }
                if (e.key === "Escape" && (replyTo || editing)) { e.stopPropagation(); setReplyTo(null); if (editing) { setEditing(null); setText(""); } }
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || (!text.trim() && !image)}>{editing ? "Save" : "Send"}</button>
          </div>
          {counter && <div className={`chat-counter ${text.length >= s.maxLen ? "full" : ""}`}>{text.length}/{s.maxLen}</div>}
        </form>
      ) : (
        <div className="chat-form">
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onNeedLogin}>
            Log in to chat
          </button>
        </div>
      )}
    </aside>
  );

  if (fullPage) return panel;
  if (hidden) return null;
  return (
    <>
      <button className={`chat-fab ${mentioned ? "ping" : ""}`} onClick={() => setOpen((o) => !o)} aria-label="Toggle chat">
        {open ? <Icon name="x" /> : <Icon name="chat" />}
        {unread > 0 && <span className="chat-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && panel}
    </>
  );
}
