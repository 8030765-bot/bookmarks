"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../CommandPalette";
import { timeAgo } from "./ui";

export interface Notification { id: string; kind: string; text: string; at: string; read?: boolean; from?: string }
export interface Profile { avatar?: string; color?: string; bio?: string }
export interface Personal {
  user: string | null;
  favorites: string[];
  ratings: Record<string, number>;
  notifications: Notification[];
  profile: Profile;
}
const EMPTY: Personal = { user: null, favorites: [], ratings: {}, notifications: [], profile: {} };

export const AVATARS = ["😀", "😎", "🐸", "🐱", "🦊", "🐼", "🦄", "👾", "🤖", "👑", "⚡", "🔥", "🌟", "🎮", "🍕", "💀"];
export const PROFILE_COLORS = ["#7c6cff", "#3dd68c", "#ffb84d", "#ff5c7a", "#4dabff", "#e879f9", "#2dd4bf", "#f97316"];

/** Loads the signed-in account's personal data and exposes optimistic mutators. */
export function usePersonal(user: string | null) {
  const [data, setData] = useState<Personal>(EMPTY);
  const load = useCallback(async () => {
    if (!user) { setData(EMPTY); return; }
    try {
      const json = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
      if (json.user) setData({ user: json.user, favorites: json.favorites || [], ratings: json.ratings || {}, notifications: json.notifications || [], profile: json.profile || {} });
    } catch {}
  }, [user]);
  useEffect(() => { load(); }, [load]);
  // poll for new notifications while logged in
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => clearInterval(id);
  }, [user, load]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const json = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    return json;
  }, []);

  const toggleFavorite = useCallback((linkId: string) => {
    setData((d) => ({ ...d, favorites: d.favorites.includes(linkId) ? d.favorites.filter((x) => x !== linkId) : [...d.favorites, linkId] }));
    post({ action: "favorite", linkId }).then((j) => j.favorites && setData((d) => ({ ...d, favorites: j.favorites }))).catch(() => {});
  }, [post]);

  const rate = useCallback((linkId: string, stars: number) => {
    setData((d) => {
      const r = { ...d.ratings };
      if (r[linkId] === stars) delete r[linkId]; else r[linkId] = stars;
      return { ...d, ratings: r };
    });
    post({ action: "rate", linkId, stars }).then((j) => j.ratings && setData((d) => ({ ...d, ratings: j.ratings }))).catch(() => {});
  }, [post]);

  const saveProfile = useCallback(async (profile: Profile) => {
    const j = await post({ action: "profile", profile });
    if (j.profile) setData((d) => ({ ...d, profile: j.profile }));
    return j;
  }, [post]);

  const markRead = useCallback(() => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => ({ ...n, read: true })) }));
    post({ action: "readNotifications" }).catch(() => {});
  }, [post]);

  return { ...data, reload: load, toggleFavorite, rate, saveProfile, markRead };
}

const KIND_ICON: Record<string, string> = { like: "heart", mention: "chat", reply: "reply", suggestion: "bulb", comment: "chat", dm: "chat", role: "lock", system: "bell" };

export function NotificationBell({ notifications, onOpen, open }: { notifications: Notification[]; onOpen: () => void; open: boolean }) {
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <button className={`icon-btn ${open ? "on" : ""}`} title="Notifications" onClick={onOpen}>
      <Icon name="bell" />
      {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

export function NotificationPanel({ notifications, onClose, onOpenChat }: { notifications: Notification[]; onClose: () => void; onOpenChat: () => void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Notifications">
        <div className="drawer-head">
          <strong>Notifications</strong>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">
          {notifications.length === 0 && <div className="admin-empty">Nothing yet. Likes, replies and @mentions show up here.</div>}
          <div className="notif-list">
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`notif ${n.read ? "" : "unread"}`}
                onClick={() => { if (n.kind === "mention" || n.kind === "reply" || n.kind === "dm") onOpenChat(); }}
              >
                <span className="notif-icon"><Icon name={KIND_ICON[n.kind] || "bell"} /></span>
                <span className="notif-text">{n.text}<span className="notif-time">{timeAgo(n.at)}</span></span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ProfileModal({ profile, onSave, onClose }: { profile: Profile; onSave: (p: Profile) => Promise<any>; onClose: () => void }) {
  const [avatar, setAvatar] = useState(profile.avatar || AVATARS[0]);
  const [color, setColor] = useState(profile.color || PROFILE_COLORS[0]);
  const [bio, setBio] = useState(profile.bio || "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your profile</h2>
        <div className="profile-preview" style={{ "--pc": color } as React.CSSProperties}>
          <span className="big-avatar">{avatar}</span>
          <div className="bio-prev">{bio || "No bio yet"}</div>
        </div>
        <div className="form-group">
          <label>Avatar</label>
          <div className="emoji-grid">
            {AVATARS.map((a) => <button type="button" key={a} className={avatar === a ? "on" : ""} onClick={() => setAvatar(a)}>{a}</button>)}
          </div>
        </div>
        <div className="form-group">
          <label>Color</label>
          <div className="swatches">
            {PROFILE_COLORS.map((c) => <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />)}
          </div>
        </div>
        <div className="form-group">
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} placeholder="Say something about yourself" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={async () => { setSaving(true); await onSave({ avatar, color, bio }); setSaving(false); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

interface PublicProfile { username: string; profile: Profile; added: number; likesReceived: number; joined?: string; role?: string | null }
export function ProfileCard({ username, onClose }: { username: string; onClose: () => void }) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`/api/profile?user=${encodeURIComponent(username)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.username ? setP(j) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [username]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-card" onClick={(e) => e.stopPropagation()}>
        {!p && !missing && <div className="admin-empty">Loading…</div>}
        {missing && <div className="admin-empty">No profile for {username}.</div>}
        {p && (
          <>
            <div className="profile-hero" style={{ "--pc": p.profile.color || "var(--accent)" } as React.CSSProperties}>
              <span className="big-avatar">{p.profile.avatar || p.username[0]?.toUpperCase()}</span>
              <div>
                <div className="profile-name">{p.username}{p.role && <span className={`pill role-${p.role}`}>{p.role}</span>}</div>
                {p.joined && <div className="row-sub">joined {timeAgo(p.joined)}</div>}
              </div>
            </div>
            {p.profile.bio && <p className="profile-bio">{p.profile.bio}</p>}
            <div className="profile-stats">
              <div><strong>{p.added}</strong><span>sites added</span></div>
              <div><strong>{p.likesReceived}</strong><span>likes received</span></div>
            </div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/** Inline 1–5 star rating. Shows the average, lets the signed-in user set theirs. */
export function StarRating({ linkId, mine, avg, count, onRate, canRate }: {
  linkId: string; mine?: number; avg?: number; count?: number; onRate: (linkId: string, stars: number) => void; canRate: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || mine || 0;
  return (
    <span className="stars" onMouseLeave={() => setHover(0)} title={count ? `${avg} average from ${count}` : "No ratings yet"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`star-btn ${n <= shown ? "on" : n <= (avg || 0) ? "avg" : ""}`}
          onMouseEnter={() => canRate && setHover(n)}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRate(linkId, n); }}
          disabled={!canRate}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >★</button>
      ))}
      {count ? <span className="star-count">{avg}</span> : null}
    </span>
  );
}
