"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { readLocal, timeAgo, writeLocal } from "./ui";
import { useOnRevChange } from "./sync";
import Markdown from "./Markdown";

export interface Notification { id: string; kind: string; text: string; at: string; read?: boolean; from?: string; link?: string }
export interface Profile {
  avatar?: string; color?: string; bio?: string; displayName?: string; status?: string; statusEmoji?: string; statusUntil?: string;
  banner?: string; border?: string; into?: string[]; showcase?: string[]; visibility?: "everyone" | "members" | "private"; hideOnline?: boolean;
}
/** A private link only you can see. */
export interface PrivateLink { id: string; name: string; url: string; createdAt: string; folder?: string }
/** Your own extras on a shared link (private note, read later, done…). */
export interface LinkPref { note?: string; later?: boolean; done?: boolean; rename?: string; hidden?: boolean; checks?: number[] }
/** Your own settings for a shared folder. */
export interface FolderPref { hidden?: boolean; fav?: boolean; follow?: boolean; sort?: string; note?: string }
/** A saved search + tag filter. */
export interface SavedView { id: string; name: string; q: string; tags: string[]; tagMode: "any" | "all"; sort?: string }
export interface Personal {
  user: string | null;
  favorites: string[];
  ratings: Record<string, number>;
  notifications: Notification[];
  profile: Profile;
  links: Record<string, LinkPref>;
  folders: Record<string, FolderPref>;
  folderOrder: string[];
  views: SavedView[];
  /** lowercase usernames you follow */
  following: string[];
  /** lowercase usernames whose chat you've hidden */
  blocked: string[];
  /** your look/layout, synced between devices */
  settings: Record<string, unknown>;
  myStuff: PrivateLink[];
  notifyPrefs: Record<string, boolean>;
  dndUntil: string | null;
  savedMessages: { id: string; channel: string; user: string; text: string; at: string; savedAt: string }[];
  /** this account has push turned on somewhere */
  push: boolean;
  /** the site's push key (null = push isn't set up) */
  pushKey: string | null;
  /** settings arrived from the server (so syncing can start) */
  loaded: boolean;
}
const EMPTY: Personal = {
  user: null, favorites: [], ratings: {}, notifications: [], profile: {}, links: {}, folders: {}, folderOrder: [], views: [],
  following: [], blocked: [], settings: {}, myStuff: [], notifyPrefs: {}, dndUntil: null, savedMessages: [], push: false, pushKey: null, loaded: false,
};
const GUEST_KEY = "guestLinkPrefs";
const GUEST_FOLDERS = "guestFolderPrefs";
const GUEST_ORDER = "guestFolderOrder";
const GUEST_VIEWS = "guestViews";

function mergePref(old: LinkPref | undefined, patch: Partial<LinkPref>): LinkPref | null {
  const next: LinkPref = { ...(old || {}), ...patch };
  (Object.keys(next) as (keyof LinkPref)[]).forEach((k) => {
    const v = next[k];
    if (v === undefined || v === false || v === "" || (Array.isArray(v) && !v.length)) delete next[k];
  });
  return Object.keys(next).length ? next : null;
}

export const AVATARS = ["😀", "😎", "🐸", "🐱", "🦊", "🐼", "🦄", "👾", "🤖", "👑", "⚡", "🔥", "🌟", "🎮", "🍕", "💀"];
export const PROFILE_COLORS = ["#7c6cff", "#3dd68c", "#ffb84d", "#ff5c7a", "#4dabff", "#e879f9", "#2dd4bf", "#f97316"];

/** Loads the signed-in account's personal data and exposes optimistic mutators. */
export function usePersonal(user: string | null) {
  const [data, setData] = useState<Personal>(EMPTY);
  const load = useCallback(async () => {
    // guests keep their notes / read-later list on this device only
    if (!user) {
      setData({
        ...EMPTY,
        links: readLocal<Record<string, LinkPref>>(GUEST_KEY, {}),
        folders: readLocal<Record<string, FolderPref>>(GUEST_FOLDERS, {}),
        folderOrder: readLocal<string[]>(GUEST_ORDER, []),
        views: readLocal<SavedView[]>(GUEST_VIEWS, []),
        loaded: true,
      });
      return;
    }
    try {
      const json = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json());
      if (json.user) {
        setData({
          user: json.user, favorites: json.favorites || [], ratings: json.ratings || {}, notifications: json.notifications || [],
          profile: json.profile || {}, links: json.links || {}, folders: json.folders || {}, folderOrder: json.folderOrder || [],
          views: json.views || [], following: json.following || [], blocked: json.blocked || [], settings: json.settings || {},
          myStuff: json.myStuff || [], notifyPrefs: json.notifyPrefs || {}, dndUntil: json.dndUntil || null, savedMessages: json.savedMessages || [],
          push: !!json.push, pushKey: json.pushKey || null, loaded: true,
        });
      }
    } catch {}
  }, [user]);
  useEffect(() => { load(); }, [load]);
  // new notifications, or changes made on another device
  useOnRevChange("user", load);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const json = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    return json;
  }, []);

  const toggleFavorite = useCallback((linkId: string) => {
    setData((d) => ({ ...d, favorites: d.favorites.includes(linkId) ? d.favorites.filter((x) => x !== linkId) : [...d.favorites, linkId] }));
    post({ action: "favorite", linkId }).then((j) => j.favorites && setData((d) => ({ ...d, favorites: j.favorites }))).catch(() => {});
  }, [post]);

  const ratingsRef = useRef(data.ratings);
  ratingsRef.current = data.ratings;
  const rate = useCallback((linkId: string, stars: number) => {
    // tapping your current rating again clears it
    const next = ratingsRef.current[linkId] === stars ? 0 : stars;
    setData((d) => {
      const r = { ...d.ratings };
      if (next) r[linkId] = next; else delete r[linkId];
      return { ...d, ratings: r };
    });
    post({ action: "rate", linkId, stars: next }).then((j) => j.ratings && setData((d) => ({ ...d, ratings: j.ratings }))).catch(() => {});
  }, [post]);

  const setLinkPref = useCallback((linkId: string, patch: Partial<LinkPref>) => {
    setData((d) => {
      const merged = mergePref(d.links[linkId], patch);
      const links = { ...d.links };
      if (merged) links[linkId] = merged; else delete links[linkId];
      if (!user) writeLocal(GUEST_KEY, links);
      return { ...d, links };
    });
    if (user) post({ action: "linkPref", linkId, patch }).then((j) => j.links && setData((d) => ({ ...d, links: j.links }))).catch(() => {});
  }, [post, user]);

  const saveProfile = useCallback(async (profile: Profile) => {
    const j = await post({ action: "profile", profile });
    if (j.profile) setData((d) => ({ ...d, profile: j.profile }));
    return j;
  }, [post]);

  const markRead = useCallback((id?: string) => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (!id || n.id === id ? { ...n, read: true } : n)) }));
    post({ action: "readNotifications", id }).catch(() => {});
  }, [post]);
  const removeNotification = useCallback((id?: string) => {
    setData((d) => ({ ...d, notifications: id ? d.notifications.filter((n) => n.id !== id) : [] }));
    post({ action: "clearNotifications", id }).catch(() => {});
  }, [post]);
  const setNotifyPrefs = useCallback((prefs: Record<string, boolean>) => {
    setData((d) => ({ ...d, notifyPrefs: { ...d.notifyPrefs, ...prefs } }));
    post({ action: "notifyPrefs", prefs }).catch(() => {});
  }, [post]);
  const setDnd = useCallback((until: string | null) => {
    setData((d) => ({ ...d, dndUntil: until }));
    post({ action: "dnd", until }).then((j) => setData((d) => ({ ...d, dndUntil: j.dndUntil ?? null }))).catch(() => {});
  }, [post]);
  const setPushOn = useCallback((on: boolean) => setData((d) => ({ ...d, push: on })), []);
  const saveMessage = useCallback((message: { id: string; channel?: string; user: string; text: string; at: string }, on: boolean) => {
    post({ action: "saveMessage", message, on }).then((j) => j.savedMessages && setData((d) => ({ ...d, savedMessages: j.savedMessages }))).catch(() => {});
  }, [post]);

  const setFolderPref = useCallback((folderId: string, patch: Partial<FolderPref>) => {
    setData((d) => {
      const next: FolderPref = { ...(d.folders[folderId] || {}), ...patch };
      (Object.keys(next) as (keyof FolderPref)[]).forEach((k) => { if (!next[k]) delete next[k]; });
      const folders = { ...d.folders };
      if (Object.keys(next).length) folders[folderId] = next; else delete folders[folderId];
      if (!user) writeLocal(GUEST_FOLDERS, folders);
      return { ...d, folders };
    });
    if (user) post({ action: "folderPref", folderId, patch }).then((j) => j.folders && setData((d) => ({ ...d, folders: j.folders }))).catch(() => {});
  }, [post, user]);

  const setFolderOrder = useCallback((order: string[]) => {
    setData((d) => ({ ...d, folderOrder: order }));
    if (user) post({ action: "folderOrder", order }).catch(() => {});
    else writeLocal(GUEST_ORDER, order);
  }, [post, user]);

  const saveView = useCallback((view: Omit<SavedView, "id"> & { id?: string }) => {
    if (user) { post({ action: "saveView", view }).then((j) => j.views && setData((d) => ({ ...d, views: j.views }))).catch(() => {}); return; }
    setData((d) => {
      const v: SavedView = { ...view, id: view.id || Math.random().toString(36).slice(2, 10) };
      const views = [v, ...d.views.filter((x) => x.id !== v.id)].slice(0, 20);
      writeLocal(GUEST_VIEWS, views);
      return { ...d, views };
    });
  }, [post, user]);

  const deleteView = useCallback((id: string) => {
    setData((d) => {
      const views = d.views.filter((x) => x.id !== id);
      if (!user) writeLocal(GUEST_VIEWS, views);
      return { ...d, views };
    });
    if (user) post({ action: "deleteView", id }).catch(() => {});
  }, [post, user]);

  const follow = useCallback(async (username: string, on: boolean) => {
    const lower = username.toLowerCase();
    setData((d) => ({ ...d, following: on ? Array.from(new Set([...d.following, lower])) : d.following.filter((x) => x !== lower) }));
    const j = await post({ action: "follow", username, on });
    if (j.following) setData((d) => ({ ...d, following: j.following }));
    return j;
  }, [post]);

  const block = useCallback(async (username: string, on: boolean) => {
    const j = await post({ action: "block", username, on });
    if (j.blocked) setData((d) => ({ ...d, blocked: j.blocked }));
    return j;
  }, [post]);

  const saveSettings = useCallback((settings: Record<string, unknown>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...settings } }));
    if (user) post({ action: "settings", settings }).catch(() => {});
  }, [post, user]);

  /** Any My Stuff change: posts the action and takes the new list from the answer. */
  const myStuffAction = useCallback(async (body: Record<string, unknown>) => {
    const j = await post(body);
    if (j.myStuff) setData((d) => ({ ...d, myStuff: j.myStuff }));
    return j;
  }, [post]);

  return {
    ...data, reload: load, toggleFavorite, rate, saveProfile, markRead, setLinkPref, setFolderPref, setFolderOrder, saveView, deleteView,
    follow, block, saveSettings, myStuffAction, removeNotification, setNotifyPrefs, setDnd, setPushOn, saveMessage,
  };
}

export function NotificationBell({ notifications, onOpen, open }: { notifications: Notification[]; onOpen: () => void; open: boolean }) {
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <button className={`icon-btn ${open ? "on" : ""}`} title="Notifications" onClick={onOpen}>
      <Icon name="bell" />
      {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

export const BANNERS: [string, string][] = [
  ["none", "None"], ["sunset", "Sunset"], ["ocean", "Ocean"], ["forest", "Forest"], ["candy", "Candy"], ["night", "Night"], ["gold", "Gold"],
];
export const BORDERS: [string, string][] = [["none", "None"], ["ring", "Ring"], ["glow", "Glow"], ["double", "Double"], ["dashed", "Dashed"]];
const MORE_AVATARS = ["🐶", "🐯", "🦁", "🐧", "🐙", "🦖", "🐝", "🌈", "🍩", "⚽", "🏀", "🎸", "🎨", "📚", "🚀", "🛹"];
const STATUS_TIMES: [string, number][] = [["Don't clear", 0], ["1 hour", 1], ["4 hours", 4], ["Today", 24], ["This week", 24 * 7]];

/** Edit your profile: avatar, name, status, banner, bio, topics, showcase. */
export function ProfileModal({ profile, links, onSave, onClose }: {
  profile: Profile;
  /** links you could showcase (your favorites and ones you added) */
  links: { id: string; name: string }[];
  onSave: (p: Profile) => Promise<any>;
  onClose: () => void;
}) {
  const [avatar, setAvatar] = useState(profile.avatar || AVATARS[0]);
  const [color, setColor] = useState(profile.color || PROFILE_COLORS[0]);
  const [border, setBorder] = useState(profile.border || "none");
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [status, setStatus] = useState(profile.status || "");
  const [statusEmoji, setStatusEmoji] = useState(profile.statusEmoji || "");
  const [statusHours, setStatusHours] = useState(0);
  const [banner, setBanner] = useState(profile.banner || "none");
  const [bio, setBio] = useState(profile.bio || "");
  const [into, setInto] = useState((profile.into || []).join(", "));
  const [showcase, setShowcase] = useState<string[]>(profile.showcase || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true);
    setError("");
    const j = await onSave({
      avatar, color, border, displayName, status, statusEmoji, banner, bio,
      statusUntil: status && statusHours ? new Date(Date.now() + statusHours * 3600_000).toISOString() : status ? "" : "",
      into: into.split(",").map((t) => t.trim()).filter(Boolean),
      showcase,
    }).catch(() => ({ error: "Couldn't save" }));
    setSaving(false);
    if (j?.error) setError(j.error); else onClose();
  }
  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Your profile</h2>
        <div className={`profile-preview banner-${banner}`} style={{ "--pc": color } as React.CSSProperties}>
          <span className={`big-avatar border-${border}`}>{avatar}</span>
          <div>
            <div className="profile-name">{displayName || "Your name"}</div>
            {status && <div className="row-sub">{statusEmoji} {status}</div>}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Optional — your username still shows too" maxLength={30} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <div className="status-row">
              <input className="emoji-in" value={statusEmoji} onChange={(e) => setStatusEmoji(e.target.value)} placeholder="📚" maxLength={8} aria-label="Status emoji" />
              <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="e.g. studying for a test" maxLength={60} />
            </div>
          </div>
        </div>
        {status && (
          <div className="form-group">
            <label>Clear status after</label>
            <div className="seg">
              {STATUS_TIMES.map(([label, hours]) => (
                <button key={label} type="button" className={statusHours === hours ? "on" : ""} onClick={() => setStatusHours(hours)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="form-group">
          <label>Avatar</label>
          <div className="emoji-grid">
            {[...AVATARS, ...MORE_AVATARS].map((a) => <button type="button" key={a} className={avatar === a ? "on" : ""} onClick={() => setAvatar(a)}>{a}</button>)}
            <input className="emoji-custom" value={[...AVATARS, ...MORE_AVATARS].includes(avatar) ? "" : avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="Other" maxLength={4} aria-label="Custom emoji" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Colour</label>
            <div className="swatches">
              {PROFILE_COLORS.map((c) => <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}
            </div>
          </div>
          <div className="form-group">
            <label>Avatar ring</label>
            <select value={border} onChange={(e) => setBorder(e.target.value)}>{BORDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="form-group">
            <label>Banner</label>
            <select value={banner} onChange={(e) => setBanner(e.target.value)}>{BANNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
        </div>
        <div className="form-group">
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder={"Say something about yourself. **bold**, *italic* and links work."} />
          <div className="hint">{bio.length}/500</div>
        </div>
        <div className="form-group">
          <label>Topics you&apos;re into</label>
          <input value={into} onChange={(e) => setInto(e.target.value)} placeholder="e.g. maths, coding, art (up to 5)" />
        </div>
        {links.length > 0 && (
          <div className="form-group">
            <label>Show off up to 3 websites</label>
            <div className="chip-grid showcase-pick">
              {links.slice(0, 40).map((l) => (
                <button type="button" key={l.id} className={`pick ${showcase.includes(l.id) ? "on" : ""}`}
                  onClick={() => setShowcase(showcase.includes(l.id) ? showcase.filter((x) => x !== l.id) : [...showcase, l.id].slice(-3))}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <div className="field-warn">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

interface PublicProfile {
  username: string;
  profile?: Profile;
  added?: number;
  likesReceived?: number;
  joined?: string;
  role?: string | null;
  social?: { followers: number; following: number; kudos: number; youFollow: boolean; followsYou: boolean; mutual: string[] };
  lastSeen?: number;
  hidden?: boolean;
  membersOnly?: boolean;
  self?: boolean;
}
/** Quick profile pop-up (the full page is /u/name). */
export function ProfileCard({ username, me, onFollow, onKudos, onClose }: {
  username: string;
  me: string | null;
  onFollow?: (u: string, on: boolean) => Promise<any>;
  onKudos?: (u: string) => Promise<any>;
  onClose: () => void;
}) {
  const [p, setP] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    fetch(`/api/profile?user=${encodeURIComponent(username)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.username ? setP(j) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [username]);
  useEffect(() => { load(); }, [load]);
  const pr = p?.profile || {};
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-card" onClick={(e) => e.stopPropagation()}>
        {!p && !missing && (
          <>
            <div className="skeleton skel-row" style={{ height: 76 }} />
            <div className="skeleton skel-line" style={{ width: "70%" }} />
            <div className="skeleton skel-line" style={{ width: "45%" }} />
          </>
        )}
        {missing && <div className="admin-empty">No profile for {username}.</div>}
        {p && (p.hidden || p.membersOnly) && <div className="admin-empty">{p.username} keeps their profile {p.hidden ? "private" : "for members — log in to see it"}.</div>}
        {p && !p.hidden && !p.membersOnly && (
          <>
            <div className={`profile-hero banner-${pr.banner || "none"}`} style={{ "--pc": pr.color || "var(--accent)" } as React.CSSProperties}>
              <span className={`big-avatar border-${pr.border || "none"}`}>{pr.avatar || p.username[0]?.toUpperCase()}</span>
              <div>
                <div className="profile-name">{pr.displayName || p.username}{p.role && <span className={`pill role-${p.role}`}>{p.role}</span>}</div>
                <div className="row-sub">@{p.username}{p.joined ? ` · joined ${timeAgo(p.joined)}` : ""}</div>
                {pr.status && <div className="row-sub">{pr.statusEmoji} {pr.status}</div>}
              </div>
            </div>
            {pr.bio && <Markdown text={pr.bio} className="profile-bio" />}
            <div className="profile-stats four">
              <div><strong>{p.added || 0}</strong><span>sites added</span></div>
              <div><strong>{p.social?.followers || 0}</strong><span>followers</span></div>
              <div><strong>{p.social?.following || 0}</strong><span>following</span></div>
              <div><strong>{p.social?.kudos || 0}</strong><span>kudos ⭐</span></div>
            </div>
            {p.social?.followsYou && <p className="muted-inline">Follows you</p>}
            {msg && <p className="hint">{msg}</p>}
            <div className="modal-actions">
              {me && !p.self && onKudos && (
                <button className="btn btn-secondary" onClick={async () => { const j = await onKudos(p.username); setMsg(j.error || `Kudos sent ⭐ (${j.left} left today)`); load(); }}>⭐ Kudos</button>
              )}
              {me && !p.self && onFollow && (
                <button className="btn btn-secondary" onClick={async () => { await onFollow(p.username, !p.social?.youFollow); load(); }}>
                  {p.social?.youFollow ? "Unfollow" : "Follow"}
                </button>
              )}
              <a className="btn btn-secondary" href={`/u/${encodeURIComponent(p.username)}`}>Full profile</a>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
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
