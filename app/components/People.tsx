"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { makeQr } from "./qr";
import { timeAgo } from "./ui";

export interface MiniProfile {
  avatar?: string;
  color?: string;
  border?: string;
  displayName?: string;
  status?: string;
  statusEmoji?: string;
}

/** Round avatar: your emoji on your colour, with an optional ring style and online dot. */
export function Avatar({ name, profile, size = 28, online }: { name: string; profile?: MiniProfile; size?: number; online?: boolean }) {
  const color = profile?.color || "var(--accent)";
  return (
    <span
      className={`avatar-x border-${profile?.border || "none"}`}
      style={{ width: size, height: size, fontSize: size * (profile?.avatar ? 0.55 : 0.42), "--pc": color } as React.CSSProperties}
      aria-hidden="true"
    >
      {profile?.avatar || name.charAt(0).toUpperCase()}
      {online && <span className="avatar-dot" />}
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
export function UserChip({ username, role, online, className = "", onOpen }: {
  username: string;
  role?: string | null;
  online?: boolean;
  className?: string;
  onOpen?: (u: string) => void;
}) {
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
        {online && <span className="mini-dot" aria-label="online" />}
        {card?.profile?.displayName || username}
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
              {card.profile?.status && <span className="hc-status">{card.profile.statusEmoji} {card.profile.status}</span>}
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
