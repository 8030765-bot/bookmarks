"use client";
import { useMemo, useState } from "react";
import { BookmarksData } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import type { Notification } from "./Personal";
import { safeHref, timeAgo } from "./ui";

const KIND_ICON: Record<string, string> = { like: "heart", mention: "chat", reply: "reply", suggestion: "bulb", comment: "chat", dm: "chat", role: "lock", system: "bell", follow: "users" };
const FILTERS: { id: string; label: string; kinds: string[] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "chat", label: "Mentions", kinds: ["mention", "reply", "comment", "dm"] },
  { id: "likes", label: "Likes", kinds: ["like"] },
  { id: "follow", label: "Following", kinds: ["follow"] },
  { id: "suggestion", label: "Suggestions", kinds: ["suggestion"] },
  { id: "system", label: "Account", kinds: ["system", "role"] },
];
export const NOTIFY_KINDS: [string, string][] = [
  ["mention", "@mentions"], ["reply", "Replies to you"], ["like", "Likes and kudos"], ["follow", "New links from people and folders you follow"],
  ["suggestion", "Your suggestions"], ["comment", "Comments"], ["role", "Role changes"], ["system", "Account and security"],
];

export interface NotifySettings {
  prefs: Record<string, boolean>;
  dndUntil: string | null;
  sound: boolean;
  push: boolean;
  /** push is set up on this site */
  pushAvailable: boolean;
}

/** The notifications drawer. */
export function NotificationPanel({
  notifications,
  toasts,
  settings,
  onOpen,
  onReadOne,
  onRemove,
  onClearAll,
  onPrefs,
  onDnd,
  onSound,
  onPush,
  onDigest,
  onClose,
}: {
  notifications: Notification[];
  toasts: { msg: string; at: number }[];
  settings: NotifySettings;
  /** go wherever the notification points */
  onOpen: (n: Notification) => void;
  onReadOne: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onPrefs: (patch: Record<string, boolean>) => void;
  onDnd: (until: string | null) => void;
  onSound: (on: boolean) => void;
  onPush: (on: boolean) => void;
  onDigest: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [tab, setTab] = useState<"inbox" | "toasts" | "settings">("inbox");
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds || [];
  const list = kinds.length ? notifications.filter((n) => kinds.includes(n.kind)) : notifications;
  const dnd = !!settings.dndUntil && Date.parse(settings.dndUntil) > Date.now();
  const until = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return d.toISOString(); };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Notifications">
        <div className="drawer-head">
          <strong>Notifications{dnd ? " · 🌙 quiet" : ""}</strong>
          <span className="drawer-head-actions">
            <button className="btn-icon" onClick={onDigest} title="This week on the site"><Icon name="chart" /></button>
            <button className={`btn-icon ${tab === "settings" ? "on" : ""}`} onClick={() => setTab(tab === "settings" ? "inbox" : "settings")} title="Notification settings"><Icon name="settings" /></button>
            <button className="btn-icon" onClick={onClose} title="Close"><Icon name="x" /></button>
          </span>
        </div>
        <div className="drawer-body">
          <div className="seg">
            <button className={tab === "inbox" ? "on" : ""} onClick={() => setTab("inbox")}>Inbox</button>
            <button className={tab === "toasts" ? "on" : ""} onClick={() => setTab("toasts")}>Recent pop-ups</button>
            <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Settings</button>
          </div>

          {tab === "inbox" && (
            <>
              <div className="notif-filters">
                {FILTERS.map((f) => {
                  const n = f.kinds.length ? notifications.filter((x) => f.kinds.includes(x.kind) && !x.read).length : notifications.filter((x) => !x.read).length;
                  return <button key={f.id} className={`pick ${filter === f.id ? "on" : ""}`} onClick={() => setFilter(f.id)}>{f.label}{n ? <em>{n}</em> : null}</button>;
                })}
              </div>
              {list.length === 0 && <div className="admin-empty">Nothing here. Likes, replies, @mentions and new links in things you follow show up here.</div>}
              <div className="notif-list">
                {list.map((n) => (
                  <div key={n.id} className={`notif ${n.read ? "" : "unread"}`}>
                    <button className="notif-main" onClick={() => { onReadOne(n.id); onOpen(n); }}>
                      <span className="notif-icon"><Icon name={KIND_ICON[n.kind] || "bell"} /></span>
                      <span className="notif-text">{n.text}<span className="notif-time">{timeAgo(n.at)}</span></span>
                    </button>
                    <span className="notif-tools">
                      {!n.read && <button className="btn-icon sm" title="Mark as read" onClick={() => onReadOne(n.id)}><Icon name="check" /></button>}
                      <button className="btn-icon sm" title="Remove" onClick={() => onRemove(n.id)}><Icon name="x" /></button>
                    </span>
                  </div>
                ))}
              </div>
              {notifications.length > 0 && (
                <div className="notif-bulk">
                  {notifications.some((n) => !n.read) && <button className="btn btn-secondary btn-sm" onClick={() => onReadOne("")}>Mark all read</button>}
                  <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm("Clear all notifications?")) onClearAll(); }}>Clear all</button>
                </div>
              )}
            </>
          )}

          {tab === "toasts" && (
            <div className="notif-list">
              {toasts.length === 0 && <div className="admin-empty">Pop-up messages from this visit show up here, in case you missed one.</div>}
              {toasts.map((t, i) => (
                <div key={i} className="notif read"><span className="notif-text">{t.msg}<span className="notif-time">{timeAgo(new Date(t.at).toISOString())}</span></span></div>
              ))}
            </div>
          )}

          {tab === "settings" && (
            <div className="notif-settings">
              <div className="admin-h">Do not disturb</div>
              <p className="modal-text">{dnd ? `Quiet until ${new Date(settings.dndUntil!).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}. Notifications still arrive, without pop-ups, sounds or phone alerts.` : "Pause pop-ups, sounds and phone alerts for a while."}</p>
              <div className="chip-grid">
                {dnd ? <button className="pick on" onClick={() => onDnd(null)}>Turn off</button> : (
                  <>
                    <button className="pick" onClick={() => onDnd(until(1))}>1 hour</button>
                    <button className="pick" onClick={() => onDnd(until(4))}>4 hours</button>
                    <button className="pick" onClick={() => onDnd(tomorrow())}>Until tomorrow</button>
                  </>
                )}
              </div>
              <div className="admin-h">Alerts</div>
              <label className="toggle-row compact">
                <div><strong>Sound when someone @mentions you</strong><span>A short ping, on this device.</span></div>
                <input type="checkbox" role="switch" checked={settings.sound} onChange={(e) => onSound(e.target.checked)} />
                <span className="switch" aria-hidden="true" />
              </label>
              <label className={`toggle-row compact ${settings.pushAvailable ? "" : "disabled"}`}>
                <div><strong>Phone / browser notifications</strong><span>{settings.pushAvailable ? "Get alerts even when the site isn't open (install it as an app on iPhone first)." : "Not set up on this site yet — an admin needs to add push keys."}</span></div>
                <input type="checkbox" role="switch" checked={settings.push} disabled={!settings.pushAvailable} onChange={(e) => onPush(e.target.checked)} />
                <span className="switch" aria-hidden="true" />
              </label>
              <div className="admin-h">Tell me about</div>
              {NOTIFY_KINDS.map(([k, label]) => (
                <label key={k} className="toggle-row compact">
                  <div><strong>{label}</strong></div>
                  <input type="checkbox" role="switch" checked={settings.prefs[k] !== false} onChange={(e) => onPrefs({ [k]: e.target.checked })} />
                  <span className="switch" aria-hidden="true" />
                </label>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** "This week on the site": new links, top rated, busiest folders, new members, top contributors. */
export function WeeklyDigest({ data, ratings, onOpenLink, onClose }: {
  data: BookmarksData;
  ratings: Record<string, { avg: number; count: number }>;
  onOpenLink: (folderId: string, linkId: string) => void;
  onClose: () => void;
}) {
  const weekAgo = Date.now() - 7 * 86400_000;
  const digest = useMemo(() => {
    const refs = data.folders.flatMap((f) => f.links.map((l) => ({ f, l })));
    const fresh = refs.filter(({ l }) => l.createdAt && Date.parse(l.createdAt) > weekAgo).sort((a, b) => (b.l.createdAt || "").localeCompare(a.l.createdAt || ""));
    const people = new Map<string, number>();
    fresh.forEach(({ l }) => l.addedBy && people.set(l.addedBy, (people.get(l.addedBy) || 0) + 1));
    const folders = new Map<string, { name: string; emoji: string; n: number }>();
    fresh.forEach(({ f }) => folders.set(f.id, { name: f.name, emoji: f.emoji, n: (folders.get(f.id)?.n || 0) + 1 }));
    const top = refs.filter(({ l }) => ratings[l.id]?.count).sort((a, b) => (ratings[b.l.id]?.avg || 0) - (ratings[a.l.id]?.avg || 0)).slice(0, 5);
    const liked = [...refs].sort((a, b) => (b.l.likes?.length || 0) - (a.l.likes?.length || 0)).filter(({ l }) => l.likes?.length).slice(0, 5);
    const changes = (data.activity || []).filter((a) => Date.parse(a.at) > weekAgo).length;
    return { fresh, people: Array.from(people).sort((a, b) => b[1] - a[1]).slice(0, 5), folders: Array.from(folders.values()).sort((a, b) => b.n - a.n).slice(0, 4), top, liked, changes };
  }, [data, ratings, weekAgo]);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="This week">
        <div className="drawer-head">
          <strong>📅 This week</strong>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body digest">
          <div className="profile-stats">
            <div><strong>{digest.fresh.length}</strong><span>new websites</span></div>
            <div><strong>{digest.changes}</strong><span>changes</span></div>
          </div>
          {digest.fresh.length > 0 && (
            <>
              <div className="admin-h">New this week</div>
              {digest.fresh.slice(0, 10).map(({ f, l }) => (
                <a key={l.id} className="cd-link" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" onClick={() => onOpenLink(f.id, l.id)}>
                  <Favicon url={l.url} name={l.name} size={16} /> {l.name} <span className="muted-inline">{f.emoji} {f.name}{l.addedBy ? ` · ${l.addedBy}` : ""}</span>
                </a>
              ))}
            </>
          )}
          {digest.folders.length > 0 && (
            <>
              <div className="admin-h">Busiest folders</div>
              {digest.folders.map((f) => <div key={f.name} className="digest-row">{f.emoji} {f.name}<span>{f.n} new</span></div>)}
            </>
          )}
          {digest.people.length > 0 && (
            <>
              <div className="admin-h">Top contributors</div>
              {digest.people.map(([u, n]) => <div key={u} className="digest-row">{u}<span>{n} added</span></div>)}
            </>
          )}
          {digest.top.length > 0 && (
            <>
              <div className="admin-h">Top rated</div>
              {digest.top.map(({ f, l }) => (
                <a key={l.id} className="cd-link" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" onClick={() => onOpenLink(f.id, l.id)}>
                  <Favicon url={l.url} name={l.name} size={16} /> {l.name} <span className="muted-inline">{ratings[l.id]?.avg}★</span>
                </a>
              ))}
            </>
          )}
          {digest.liked.length > 0 && (
            <>
              <div className="admin-h">Most liked</div>
              {digest.liked.map(({ f, l }) => (
                <a key={l.id} className="cd-link" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer" onClick={() => onOpenLink(f.id, l.id)}>
                  <Favicon url={l.url} name={l.name} size={16} /> {l.name} <span className="muted-inline">♥ {l.likes?.length}</span>
                </a>
              ))}
            </>
          )}
          {digest.fresh.length === 0 && <div className="admin-empty">A quiet week — nothing new yet.</div>}
        </div>
      </aside>
    </div>
  );
}

/** A short two-note ping (no sound file needed). */
export function playPing() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.22);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // sound not available — no problem
  }
}

/** Turn browser push on: ask permission, subscribe, send the subscription to the server. */
export async function enablePush(publicKey: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser can't do push notifications (on iPhone, add the site to your home screen first)");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site in your browser settings");
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(publicKey.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pushSubscribe", subscription: sub.toJSON() }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't turn on notifications");
  return true;
}
export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pushUnsubscribe", endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}
