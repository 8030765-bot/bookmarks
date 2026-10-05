"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { makeQr } from "./qr";
import { timeAgo } from "./ui";
import { useOnRevChange } from "./sync";
import { badgeById } from "@/lib/badges";

export interface MiniProfile {
  avatar?: string;
  color?: string;
  border?: string;
  displayName?: string;
  status?: string;
  statusEmoji?: string;
  /** uploaded picture (image id) */
  pic?: string;
  picGif?: string;
  availability?: "away" | "busy";
  badges?: string[];
}

/* ---------- everyone's face (picture/emoji, colour, display name), loaded once per page ---------- */
interface Face { a?: string; c?: string; b?: string; n?: string; p?: string; g?: string; v?: "away" | "busy"; s?: string; d?: string }
/** "MM-DD" for today, to spot birthdays. */
export const todayMD = () => { const n = new Date(); return `${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };
let faces: Record<string, Face> | null = null;
let facesLoading = false;
const faceSubs = new Set<() => void>();
export function refreshFaces() {
  facesLoading = true;
  fetch("/api/faces", { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => { if (j.faces) { faces = j.faces; faceSubs.forEach((f) => f()); } })
    .catch(() => {})
    .finally(() => { facesLoading = false; });
}
export function useFace(name: string | null | undefined): Face | undefined {
  useEffect(() => { if (!faces && !facesLoading) refreshFaces(); }, []);
  return useSyncExternalStore(
    (cb) => { faceSubs.add(cb); return () => { faceSubs.delete(cb); }; },
    () => (name && faces ? faces[name.toLowerCase()] : undefined),
    () => undefined,
  );
}
/** Everyone's faces at once (for long lists like chat). */
export function useFaces(): Record<string, Face> | null {
  useEffect(() => { if (!faces && !facesLoading) refreshFaces(); }, []);
  return useSyncExternalStore(
    (cb) => { faceSubs.add(cb); return () => { faceSubs.delete(cb); }; },
    () => faces,
    () => null,
  );
}
/** Keep faces fresh when someone changes their picture or name. Mount once per page. */
export function useFacesSync() {
  useOnRevChange("faces", refreshFaces);
}
const fromFace = (f?: Face): MiniProfile => ({ avatar: f?.a, color: f?.c, border: f?.b, displayName: f?.n, pic: f?.p, picGif: f?.g, availability: f?.v });
/** The name to show for someone: their display name if they set one. */
export function useDisplayName(username: string) {
  return useFace(username)?.n || username;
}

/**
 * Round avatar: an uploaded picture (a moving one plays while hovered), or
 * an emoji on their colour, with an optional ring and online dot. Pass
 * `profile` when you have it; otherwise it's looked up by name.
 */
export function Avatar({ name, profile, size = 28, online }: { name: string; profile?: MiniProfile; size?: number; online?: boolean }) {
  const face = useFace(profile ? null : name);
  const pr = profile || fromFace(face);
  const [hover, setHover] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  const color = pr.color || "var(--accent)";
  const picId = hover && pr.picGif ? pr.picGif : pr.pic;
  const showPic = !!picId && broken !== picId;
  return (
    <span
      className={`avatar-x border-${pr.border || "none"} ${showPic ? "has-pic" : ""}`}
      style={{ width: size, height: size, fontSize: size * (pr.avatar ? 0.55 : 0.42), "--pc": color } as React.CSSProperties}
      aria-hidden="true"
      onMouseEnter={pr.picGif ? () => setHover(true) : undefined}
      onMouseLeave={pr.picGif ? () => setHover(false) : undefined}
    >
      {showPic ? <img src={`/api/img/${picId}`} alt="" loading="lazy" decoding="async" onError={() => setBroken(picId!)} /> : pr.avatar || name.charAt(0).toUpperCase()}
      {online && <span className={`avatar-dot ${pr.availability || ""}`} />}
    </span>
  );
}

export const roleClass = (role?: string | null) => (role ? `role-name role-${role}` : "");

/* ---------- flair: short titles admins give people ("Link hunter", "Helper of the month") ---------- */
let flairMap: Record<string, string> = {};
const flairListeners = new Set<() => void>();
export function setFlairMap(map: Record<string, string>) {
  flairMap = map || {};
  flairListeners.forEach((f) => f());
}
export function useFlair(username: string) {
  return useSyncExternalStore(
    (cb) => { flairListeners.add(cb); return () => { flairListeners.delete(cb); }; },
    () => flairMap[username.toLowerCase()],
    () => undefined,
  );
}
export function Flair({ username }: { username: string }) {
  const f = useFlair(username);
  return f ? <span className="flair">{f}</span> : null;
}

/* ---------- hover cards on usernames ---------- */
interface CardData {
  username: string;
  profile?: MiniProfile & { bio?: string };
  role?: string | null;
  added?: number;
  social?: { followers: number; following: number; kudos: number };
  lastSeen?: number;
  hidden?: boolean;
  membersOnly?: boolean;
}
const cache = new Map<string, Promise<CardData | null>>();
function loadCard(username: string): Promise<CardData | null> {
  const key = username.toLowerCase();
  if (!cache.has(key)) {
    cache.set(key, fetch(`/api/profile?user=${encodeURIComponent(username)}`).then((r) => r.json()).then((j) => (j.username ? j : null)).catch(() => null));
    setTimeout(() => cache.delete(key), 60_000);
  }
  return cache.get(key)!;
}

/**
 * A username you can hover for a mini profile card, and click to open the
 * full profile. Owner / admin / mod names are coloured.
 */
export function UserChip({ username, role, online, className = "", onOpen, face = false }: {
  username: string;
  role?: string | null;
  online?: boolean;
  className?: string;
  onOpen?: (u: string) => void;
  /** show their picture before the name */
  face?: boolean;
}) {
  const myFace = useFace(username);
  const shownName = myFace?.n || username;
  const birthday = !!myFace?.d && myFace.d === todayMD();
  const [card, setCard] = useState<CardData | null>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const enter = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setShow(true);
      loadCard(username).then(setCard);
    }, 350);
  };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setShow(false), 150); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const r = card?.role ?? role;
  const flair = useFlair(username);
  return (
    <span className="user-chip-wrap" onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}>
      <button
        className={`user-chip ${roleClass(r)} ${className}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onOpen) onOpen(username); else location.href = `/u/${encodeURIComponent(username)}`; }}
      >
        {face ? <Avatar name={username} size={18} online={online} /> : online && <span className="mini-dot" aria-label="online" />}
        {card?.profile?.displayName || shownName}
        {birthday && <span className="bday" title="It's their birthday today!">🎂</span>}
      </button>
      {flair && <span className="flair">{flair}</span>}
      {show && (
        <span className="hover-card" role="tooltip" onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave}>
          {!card ? (
            <span className="skeleton skel-line" style={{ width: 160 }} />
          ) : card.hidden || card.membersOnly ? (
            <span className="muted-inline">{card.username} keeps their profile private.</span>
          ) : (
            <>
              <span className="hc-top">
                <Avatar name={card.username} profile={card.profile} size={40} />
                <span className="hc-names">
                  <strong className={roleClass(card.role)}>{card.profile?.displayName || card.username}</strong>
                  <span className="muted-inline">@{card.username}{card.role ? ` · ${card.role}` : ""}</span>
                </span>
              </span>
              {card.profile?.availability && <span className={`hc-avail ${card.profile.availability}`}>{card.profile.availability === "busy" ? "⛔ Busy" : "🌙 Away"}</span>}
              {card.profile?.status && <span className="hc-status">{card.profile.statusEmoji} {card.profile.status}</span>}
              {card.profile?.badges?.length ? (
                <span className="hc-badges">{card.profile.badges.map((b) => { const d = badgeById(b); return d ? <span key={b} className="badge-chip" title={d.how}>{d.emoji} {d.name}</span> : null; })}</span>
              ) : null}
              {card.profile?.bio && <span className="hc-bio">{card.profile.bio.replace(/[*_`#>]/g, "").slice(0, 120)}</span>}
              <span className="hc-stats">
                <span><strong>{card.added || 0}</strong> added</span>
                <span><strong>{card.social?.followers || 0}</strong> followers</span>
                <span><strong>{card.social?.kudos || 0}</strong> ⭐</span>
              </span>
              {card.lastSeen ? <span className="muted-inline">{Date.now() - card.lastSeen < 90_000 ? "🟢 online now" : `active ${timeAgo(new Date(card.lastSeen).toISOString())}`}</span> : null}
            </>
          )}
        </span>
      )}
    </span>
  );
}

/** "✓ that name is free" under a username box, checked as you type. */
export function NameCheck({ name, current }: { name: string; current?: string }) {
  const [res, setRes] = useState<{ name: string; available: boolean; reason?: string } | null>(null);
  const n = name.trim();
  useEffect(() => {
    if (n.length < 3 || n.toLowerCase() === current?.toLowerCase()) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/auth?check=${encodeURIComponent(n)}`, { signal: ctl.signal })
        .then((r) => r.json()).then((j) => setRes({ name: n, ...j })).catch(() => {});
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [n, current]);
  if (!n) return null;
  if (n.length < 3) return <div className="name-check">At least 3 characters</div>;
  if (n.toLowerCase() === current?.toLowerCase()) return null;
  if (!res || res.name !== n) return <div className="name-check">Checking…</div>;
  return <div className={`name-check ${res.available ? "ok" : "bad"}`} aria-live="polite">{res.available ? `✓ “${n}” is free` : `✗ ${res.reason}`}</div>;
}

/* ---------- QR code ---------- */
export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const grid = useMemo(() => { try { return makeQr(text); } catch { return null; } }, [text]);
  if (!grid) return null;
  const n = grid.length + 8;
  const path = grid.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + 4} ${y + 4}h1v1h-1z` : ""))).join("");
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/* ---------- password strength ---------- */
const COMMON = ["password", "123456", "qwerty", "abc123", "letmein", "111111", "iloveyou", "school", "minecraft", "roblox", "fortnite"];
export function passwordScore(pw: string): { score: number; label: string; tip: string } {
  if (!pw) return { score: 0, label: "", tip: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const lower = pw.toLowerCase();
  if (COMMON.some((c) => lower.includes(c)) || /^(.)\1+$/.test(pw) || /^(0123|1234|abcd)/.test(lower)) score = Math.min(score, 1);
  if (pw.length < 6) score = 0;
  const labels = ["Too weak", "Weak", "OK", "Good", "Strong", "Very strong"];
  const tip = pw.length < 8 ? "Longer is stronger — try 3 random words." : score < 3 ? "Mix in capitals, numbers or a symbol." : "";
  return { score, label: labels[score], tip };
}
export function PasswordStrength({ password }: { password: string }) {
  const { score, label, tip } = passwordScore(password);
  if (!password) return null;
  return (
    <div className="pw-meter" aria-live="polite">
      <span className="pw-bars">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={i < score ? `on s${score}` : ""} />)}</span>
      <span className="pw-label">{label}{tip ? ` — ${tip}` : ""}</span>
    </div>
  );
}
