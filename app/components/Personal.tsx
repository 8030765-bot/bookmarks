"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { readLocal, timeAgo, writeLocal } from "./ui";
import { useOnRevChange } from "./sync";
import Markdown from "./Markdown";
import { ImageCropper } from "./ImageCropper";
import { Avatar } from "./People";
import { badgeById } from "@/lib/badges";

export interface Notification { id: string; kind: string; text: string; at: string; read?: boolean; from?: string; link?: string; snoozeUntil?: string }
export interface Profile {
  avatar?: string; color?: string; bio?: string; displayName?: string; status?: string; statusEmoji?: string; statusUntil?: string;
  banner?: string; border?: string; themeCode?: string; into?: string[]; showcase?: string[]; visibility?: "everyone" | "members" | "private"; hideOnline?: boolean;
  lastSeenTo?: "friends"; availability?: "" | "away" | "busy"; badges?: string[]; birthday?: string;
  pic?: string; picGif?: string; picPending?: string; bannerPic?: string; bannerPending?: string;
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
  quietHours: { from: string; to: string; tz: string } | null;
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
  following: [], blocked: [], settings: {}, myStuff: [], notifyPrefs: {}, dndUntil: null, quietHours: null, savedMessages: [], push: false, pushKey: null, loaded: false,
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
          myStuff: json.myStuff || [], notifyPrefs: json.notifyPrefs || {}, dndUntil: json.dndUntil || null, quietHours: json.quietHours || null, savedMessages: json.savedMessages || [],
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

  const uploadPicture = useCallback(async (kind: "avatar" | "banner", image: string, still?: string) => {
    const j = await post({ action: "uploadPicture", kind, data: image, still });
    if (j.profile) setData((d) => ({ ...d, profile: j.profile }));
    return j;
  }, [post]);
  const removePicture = useCallback(async (kind: "avatar" | "banner") => {
    const j = await post({ action: "removePicture", kind });
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
  const setQuietHours = useCallback((q: { from: string; to: string } | null) => {
    const value = q ? { ...q, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } : null;
    setData((d) => ({ ...d, quietHours: value }));
    post({ action: "quietHours", quietHours: value }).then((j) => setData((d) => ({ ...d, quietHours: j.quietHours ?? null }))).catch(() => {});
  }, [post]);
  const snooze = useCallback((id: string, until: string) => {
    setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, snoozeUntil: until, read: false } : n)) }));
    post({ action: "snoozeNotification", id, until }).then((j) => j.notifications && setData((d) => ({ ...d, notifications: j.notifications }))).catch(() => {});
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
    ...data, reload: load, toggleFavorite, rate, saveProfile, uploadPicture, removePicture, markRead, setLinkPref, setFolderPref, setFolderOrder, saveView, deleteView,
    follow, block, saveSettings, myStuffAction, removeNotification, setNotifyPrefs, setDnd, setQuietHours, snooze, setPushOn, saveMessage,
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

/** Quick statuses to pick with one tap. */
const STATUS_PRESETS: [string, string][] = [["📚", "Studying"], ["🎮", "Gaming"], ["🍕", "Lunch"], ["🎧", "Listening to music"], ["🏃", "Out and about"], ["😴", "Sleeping"]];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
interface EarnedBadge { id: string; emoji: string; name: string; how: string }

/** Edit your profile: picture, name, status, banner, bio, topics, badges, showcase. */
export function ProfileModal({ user, profile, links, onSave, onUploadPicture, onRemovePicture, onClose }: {
  user: string;
  profile: Profile;
  /** links you could showcase (your favorites and ones you added) */
  links: { id: string; name: string }[];
  onSave: (p: Profile) => Promise<any>;
  onUploadPicture: (kind: "avatar" | "banner", data: string, still?: string) => Promise<any>;
  onRemovePicture: (kind: "avatar" | "banner") => Promise<any>;
  onClose: () => void;
}) {
  const [avatar, setAvatar] = useState(profile.avatar || AVATARS[0]);
  const [color, setColor] = useState(profile.color || PROFILE_COLORS[0]);
  const [border, setBorder] = useState(profile.border || "none");
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [status, setStatus] = useState(profile.status || "");
  const [statusEmoji, setStatusEmoji] = useState(profile.statusEmoji || "");
  const [statusHours, setStatusHours] = useState(0);
  const [availability, setAvailability] = useState<"" | "away" | "busy">(profile.availability || "");
  const [banner, setBanner] = useState(profile.banner || "none");
  const [bio, setBio] = useState(profile.bio || "");
  const [into, setInto] = useState((profile.into || []).join(", "));
  const [showcase, setShowcase] = useState<string[]>(profile.showcase || []);
  const [badges, setBadges] = useState<string[]>(profile.badges || []);
  const [birthday, setBirthday] = useState(profile.birthday || "");
  const [earned, setEarned] = useState<EarnedBadge[] | null>(null);
  const [crop, setCrop] = useState<null | "avatar" | "banner">(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    // which badges you've earned, to pick from
    Promise.all([fetch(`/api/profile?user=${encodeURIComponent(user)}`, { cache: "no-store" }).then((r) => r.json()), import("@/lib/badges")])
      .then(([j, m]) => setEarned((j.badges || []).map((id: string) => m.badgeById(id)).filter(Boolean)))
      .catch(() => setEarned([]));
  }, [user]);
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setTouched(true); };
  async function save() {
    setSaving(true);
    setError("");
    const j = await onSave({
      avatar, color, border, displayName, status, statusEmoji, banner, bio, availability, badges, birthday,
      statusUntil: status && statusHours ? new Date(Date.now() + statusHours * 3600_000).toISOString() : "",
      into: into.split(",").map((t) => t.trim()).filter(Boolean),
      showcase,
    }).catch(() => ({ error: "Couldn't save" }));
    setSaving(false);
    if (j?.error) setError(j.error); else onClose();
  }
  const close = () => { if (!saving && (!touched || confirm("Close without saving your changes?"))) onClose(); };
  const [bm, bd] = birthday ? birthday.split("-") : ["", ""];
  const setBday = (m: string, d: string) => change(setBirthday)(m && d ? `${m}-${d}` : "");
  const picPreview = profile.pic ? `/api/img/${profile.pic}` : null;
  const pendingPic = profile.picPending ? `/api/img/${profile.picPending}` : null;
  const bannerImg = profile.bannerPic ? `/api/img/${profile.bannerPic}` : null;
  const profileUrl = typeof location !== "undefined" ? `${location.origin}/u/${encodeURIComponent(user)}` : `/u/${user}`;
  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Your profile</h2>
        <div className={`profile-preview banner-${banner} ${bannerImg ? "has-banner-img" : ""}`} style={{ "--pc": color, ...(bannerImg ? { backgroundImage: `url(${bannerImg})` } : {}) } as React.CSSProperties}>
          <span className={`big-avatar border-${border} ${picPreview ? "has-pic" : ""}`}>{picPreview ? <img src={picPreview} alt="" /> : avatar}</span>
          <div>
            <div className="profile-name">{displayName || user}</div>
            {status && <div className="row-sub">{statusEmoji} {status}</div>}
            {availability && <div className="row-sub">{availability === "busy" ? "⛔ Busy" : "🌙 Away"}</div>}
          </div>
        </div>

        <div className="form-group">
          <label>Profile picture</label>
          <div className="pic-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCrop("avatar")}>🖼️ Upload a picture</button>
            {(profile.pic || profile.picPending) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await onRemovePicture("avatar"); setNote("Picture removed — your emoji shows instead"); }}>Use my emoji instead</button>
            )}
            {pendingPic && (
              <span className="pic-pending"><img src={pendingPic} alt="Your new picture" /> Waiting for a moderator — people see your {profile.pic ? "old picture" : "emoji"} until then.</span>
            )}
          </div>
          <div className="hint">PNG, JPEG, WebP or a GIF (moving pictures play when someone hovers). New pictures are checked by a moderator first.</div>
        </div>
        {note && <p className="hint">{note}</p>}

        <div className="form-row">
          <div className="form-group">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => change(setDisplayName)(e.target.value)} placeholder="Optional — your username still shows too" maxLength={30} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <div className="status-row">
              <input className="emoji-in" value={statusEmoji} onChange={(e) => change(setStatusEmoji)(e.target.value)} placeholder="📚" maxLength={8} aria-label="Status emoji" />
              <input value={status} onChange={(e) => change(setStatus)(e.target.value)} placeholder="e.g. revising for maths" maxLength={60} />
            </div>
            <div className="chip-grid status-presets">
              {STATUS_PRESETS.map(([e, t]) => <button type="button" key={t} className="pick" onClick={() => { change(setStatusEmoji)(e); setStatus(t); }}>{e} {t}</button>)}
              {status && <button type="button" className="pick" onClick={() => { change(setStatus)(""); setStatusEmoji(""); }}>✕ Clear</button>}
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
          <label>Show me as</label>
          <div className="seg">
            {([["", "🟢 Automatic"], ["away", "🌙 Away"], ["busy", "⛔ Busy"]] as const).map(([v, l]) => (
              <button key={v} type="button" className={availability === v ? "on" : ""} onClick={() => change(setAvailability)(v)}>{l}</button>
            ))}
          </div>
          <div className="hint">Busy also keeps notifications quiet (no pop-ups or sounds).</div>
        </div>
        <div className="form-group">
          <label>Emoji {profile.pic ? "(shown if your picture can't load)" : ""}</label>
          <div className="emoji-grid">
            {[...AVATARS, ...MORE_AVATARS].map((a) => <button type="button" key={a} className={avatar === a ? "on" : ""} onClick={() => change(setAvatar)(a)}>{a}</button>)}
            <input className="emoji-custom" value={[...AVATARS, ...MORE_AVATARS].includes(avatar) ? "" : avatar} onChange={(e) => change(setAvatar)(e.target.value)} placeholder="Other" maxLength={4} aria-label="Custom emoji" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Colour</label>
            <div className="swatches">
              {PROFILE_COLORS.map((c) => <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => change(setColor)(c)} aria-label={c} />)}
              <label className={`swatch custom-swatch ${PROFILE_COLORS.includes(color) ? "" : "on"}`} title="Any colour" style={{ background: PROFILE_COLORS.includes(color) ? undefined : color }}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#7c6cff"} onChange={(e) => change(setColor)(e.target.value)} aria-label="Pick any colour" />
              </label>
            </div>
            <div className="hint">Tints your profile, hover card and chat messages.</div>
          </div>
          <div className="form-group">
            <label>Avatar ring</label>
            <select value={border} onChange={(e) => change(setBorder)(e.target.value)}>{BORDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="form-group">
            <label>Banner</label>
            <select value={banner} onChange={(e) => change(setBanner)(e.target.value)}>{BANNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <div className="pic-row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCrop("banner")}>Upload a banner</button>
              {(profile.bannerPic || profile.bannerPending) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRemovePicture("banner")}>Remove</button>}
            </div>
            {profile.bannerPending && <div className="hint">New banner waiting for a moderator.</div>}
          </div>
        </div>
        <div className="form-group">
          <label>Bio</label>
          <textarea value={bio} onChange={(e) => change(setBio)(e.target.value)} maxLength={500} placeholder={"Say something about yourself. **bold**, *italic* and links work."} />
          <div className="hint">{bio.length}/500</div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Topics you&apos;re into</label>
            <input value={into} onChange={(e) => change(setInto)(e.target.value)} placeholder="e.g. maths, coding, art (up to 5)" />
          </div>
          <div className="form-group">
            <label>Birthday <span className="muted-inline">(no year — confetti on the day 🎉)</span></label>
            <div className="status-row">
              <select value={bm} onChange={(e) => setBday(e.target.value, bd || "01")} aria-label="Birthday month">
                <option value="">—</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
              </select>
              <select value={bd} onChange={(e) => setBday(bm || "01", e.target.value)} aria-label="Birthday day">
                <option value="">—</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
              </select>
              {birthday && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBday("", "")}>Clear</button>}
            </div>
          </div>
        </div>
        <div className="form-group">
          <label>Badges to show off (up to 3)</label>
          {earned === null ? <div className="skeleton skel-line" style={{ width: 200 }} /> : earned.length === 0 ? (
            <div className="hint">No badges yet — add websites, rate them and get kudos to earn some.</div>
          ) : (
            <div className="chip-grid">
              {earned.map((b) => (
                <button type="button" key={b.id} title={b.how} className={`pick ${badges.includes(b.id) ? "on" : ""}`}
                  onClick={() => change(setBadges)(badges.includes(b.id) ? badges.filter((x) => x !== b.id) : [...badges, b.id].slice(-3))}>
                  {b.emoji} {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {links.length > 0 && (
          <div className="form-group">
            <label>Show off up to 3 websites</label>
            <div className="chip-grid showcase-pick">
              {links.slice(0, 40).map((l) => (
                <button type="button" key={l.id} className={`pick ${showcase.includes(l.id) ? "on" : ""}`}
                  onClick={() => change(setShowcase)(showcase.includes(l.id) ? showcase.filter((x) => x !== l.id) : [...showcase, l.id].slice(-3))}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="form-group">
          <label>Your profile link</label>
          <div className="status-row">
            <input readOnly value={profileUrl} onFocus={(e) => e.target.select()} aria-label="Your profile link" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(profileUrl).then(() => setNote("Profile link copied ✓")).catch(() => {})}><Icon name="copy" /> Copy</button>
          </div>
        </div>
        {error && <div className="field-warn">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={close} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      {crop && (
        <ImageCropper
          title={crop === "avatar" ? "Your profile picture" : "Your profile banner"}
          aspect={crop === "avatar" ? 1 : 3}
          outW={crop === "avatar" ? 192 : 900}
          round={crop === "avatar"}
          allowGif={crop === "avatar"}
          onCancel={() => setCrop(null)}
          onDone={async (r) => {
            const j = await onUploadPicture(crop, r.data, r.still);
            if (j?.error) throw new Error(j.error);
            setCrop(null);
            setNote(j.pending ? "Uploaded ✓ — a moderator will check it soon. You'll get a notification." : "Uploaded ✓");
          }}
        />
      )}
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
            <div className={`profile-hero banner-${pr.banner || "none"} ${pr.bannerPic ? "has-banner-img" : ""}`} style={{ "--pc": pr.color || "var(--accent)", ...(pr.bannerPic ? { backgroundImage: `url(/api/img/${pr.bannerPic})` } : {}) } as React.CSSProperties}>
              <Avatar name={p.username} profile={pr as any} size={48} />
              <div>
                <div className="profile-name">{pr.displayName || p.username}{p.role && <span className={`pill role-${p.role}`}>{p.role}</span>}</div>
                <div className="row-sub">@{p.username}{p.joined ? ` · joined ${timeAgo(p.joined)}` : ""}</div>
                {pr.status && <div className="row-sub">{pr.statusEmoji} {pr.status}</div>}
              </div>
            </div>
            {pr.badges?.length ? (
              <div className="hc-badges">{pr.badges.map((b) => { const d = badgeById(b); return d ? <span key={b} className="badge-chip" title={d.how}>{d.emoji} {d.name}</span> : null; })}</div>
            ) : null}
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
              <button className="btn btn-secondary" title="Copy a link to this profile" onClick={() => navigator.clipboard.writeText(`${location.origin}/u/${encodeURIComponent(p.username)}`).then(() => setMsg("Profile link copied ✓")).catch(() => {})}><Icon name="copy" /></button>
              {me && !p.self && pr.pic && <ReportPictureButton username={p.username} pic={pr.pic} onDone={setMsg} />}
              <a className="btn btn-secondary" href={`/u/${encodeURIComponent(p.username)}`}>Full profile</a>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Report someone's profile picture to the moderators. */
export function ReportPictureButton({ username, pic, onDone }: { username: string; pic: string; onDone: (msg: string) => void }) {
  return (
    <button className="btn btn-secondary" title="Report this profile picture to a moderator" onClick={async () => {
      const reason = prompt(`What's wrong with ${username}'s picture?`);
      if (!reason?.trim()) return;
      const j = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "picture", targetId: username, targetName: `${username}'s picture`, reason, extra: pic }),
      }).then((r) => r.json()).catch(() => ({ error: "Couldn't send that" }));
      onDone(j.error || "Thanks — a moderator will take a look");
    }}>🚩 Report picture</button>
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
