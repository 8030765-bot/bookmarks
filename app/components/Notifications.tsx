"use client";
import { useMemo, useState } from "react";
import { BookmarksData } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import type { Notification } from "./Personal";
import { readLocal, safeHref, timeAgo, writeLocal } from "./ui";
import { useSavedTick } from "./guard";

const KIND_ICON: Record<string, string> = { share: "share", like: "heart", mention: "chat", reply: "reply", suggestion: "bulb", comment: "chat", dm: "chat", role: "lock", system: "bell", follow: "users" };
const FILTERS: { id: string; label: string; kinds: string[] }[] = [
  { id: "all", label: "All", kinds: [] },
  { id: "chat", label: "Mentions", kinds: ["mention", "reply", "comment", "dm"] },
  { id: "likes", label: "Likes", kinds: ["like"] },
  { id: "share", label: "Sent to you", kinds: ["share"] },
  { id: "follow", label: "Following", kinds: ["follow"] },
  { id: "suggestion", label: "Suggestions", kinds: ["suggestion"] },
  { id: "system", label: "Account", kinds: ["system", "role"] },
];
export const NOTIFY_KINDS: [string, string][] = [
  ["mention", "@mentions"], ["reply", "Replies to you"], ["share", "Websites friends send you"], ["like", "Likes and kudos"], ["follow", "New links from people and folders you follow"],
  ["suggestion", "Your suggestions"], ["comment", "Comments"], ["role", "Role changes"], ["system", "Account and security"],
];

export interface NotifySettings {
  prefs: Record<string, boolean>;
  dndUntil: string | null;
  quietHours: { from: string; to: string; tz: string } | null;
  sound: boolean;
  /** which ping */
  soundName: string;
  push: boolean;
  /** push is set up on this site */
  pushAvailable: boolean;
}

/** When "remind me later" can bring a notification back. */
function snoozeTimes(): [string, string][] {
  const now = new Date();
  const at = (h: number, dayOffset = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const out: [string, string][] = [["In 1 hour", new Date(Date.now() + 3600_000).toISOString()], ["In 3 hours", new Date(Date.now() + 3 * 3600_000).toISOString()]];
  if (now.getHours() < 17) out.push(["This evening", at(18)]);
  out.push(["Tomorrow morning", at(8, 1)]);
  return out;
}

/**
 * "kai liked your link" + "ben liked your link" → "kai and ben liked your
 * link": same kind, same place and the same words apart from the name.
 */
export function groupNotifications(list: Notification[]): { items: Notification[]; text: string }[] {
  const out: { key: string; items: Notification[]; tpl: string | null }[] = [];
  const byKey = new Map<string, (typeof out)[number]>();
  for (const n of list) {
    const tpl = n.from && n.text.includes(n.from) && ["like", "follow", "comment"].includes(n.kind) ? n.text.split(n.from).join("\u0000") : null;
    const key = tpl ? `${n.kind}|${n.link || ""}|${tpl}` : n.id;
    const g = byKey.get(key);
    if (g && Date.parse(g.items[0].at) - Date.parse(n.at) < 3 * 86400_000) { g.items.push(n); continue; }
    const fresh = { key, items: [n], tpl };
    byKey.set(key, fresh);
    out.push(fresh);
  }
  return out.map(({ items, tpl }) => {
    if (items.length === 1 || !tpl) return { items, text: items[0].text };
    const names = Array.from(new Set(items.map((x) => x.from!)));
    const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} other${names.length - 2 === 1 ? "" : "s"}`;
    return { items, text: tpl.split("\u0000").join(who) };
  });
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
  onSnooze,
  onQuietHours,
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
  onSound: (on: boolean, name?: string) => void;
  onPush: (on: boolean) => void;
  onDigest: () => void;
  onClose: () => void;
  onSnooze: (id: string, until: string) => void;
  onQuietHours: (q: { from: string; to: string } | null) => void;
}) {
  const [snoozing, setSnoozing] = useState<string | null>(null);
  // settings changes save straight away; say so
  const { saved, tick } = useSavedTick();
  const withTick = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { fn(...a); saved(); };
  onPrefs = withTick(onPrefs);
  onDnd = withTick(onDnd);
  onSound = withTick(onSound);
  onQuietHours = withTick(onQuietHours);
  const now = Date.now();
  const snoozed = notifications.filter((n) => n.snoozeUntil && Date.parse(n.snoozeUntil) > now);
  notifications = notifications.filter((n) => !n.snoozeUntil || Date.parse(n.snoozeUntil) <= now);
  const [filter, setFilter] = useState("all");
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMsg, setReplyMsg] = useState("");
  /** Reply to a chat message straight from its notification. */
  async function sendReply(n: Notification) {
    const params = new URLSearchParams((n.link || "").split("?")[1] || "");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ch: params.get("ch") || "general", text: replyText, replyTo: params.get("msg") || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setReplyMsg(j.error || "Couldn't send"); return; }
    setReplyText("");
    setReplying(null);
    setReplyMsg("");
    onReadOne(n.id);
  }
  // opens on the tab you used last
  const [tab, setTabState] = useState<"inbox" | "toasts" | "settings">(() => { const t = readLocal<string>("notifTab", "inbox"); return t === "toasts" || t === "settings" ? t : "inbox"; });
  const setTab = (t: "inbox" | "toasts" | "settings") => { setTabState(t); writeLocal("notifTab", t); };
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds || [];
  const list = kinds.length ? notifications.filter((n) => kinds.includes(n.kind)) : notifications;
  const groups = useMemo(() => groupNotifications(list), [list]);
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
                {groups.map(({ items, text }) => {
                  const n = items[0];
                  const unread = items.some((x) => !x.read);
                  return (
                  <div key={n.id} className={`notif ${unread ? "unread" : ""} ${items.length > 1 ? "grouped" : ""}`}>
                    <button className="notif-main" onClick={() => { items.forEach((x) => !x.read && onReadOne(x.id)); onOpen(n); }}>
                      <span className="notif-icon"><Icon name={KIND_ICON[n.kind] || "bell"} />{items.length > 1 && <em className="notif-count">{items.length}</em>}</span>
                      <span className="notif-text">{text}<span className="notif-time">{timeAgo(n.at)}{items.length > 1 ? ` · ${items.length} notifications` : ""}</span></span>
                    </button>
                    <span className="notif-tools">
                      <button className="btn-icon sm" title="Remind me later" onClick={() => setSnoozing(snoozing === n.id ? null : n.id)}><Icon name="clock" /></button>
                      {(n.kind === "mention" || n.kind === "reply") && n.link?.includes("msg=") && (
                        <button className="btn-icon sm" title="Reply" onClick={() => { setReplying(replying === n.id ? null : n.id); setReplyMsg(""); }}><Icon name="reply" /></button>
                      )}
                      {unread && <button className="btn-icon sm" title="Mark as read" onClick={() => items.forEach((x) => !x.read && onReadOne(x.id))}><Icon name="check" /></button>}
                      <button className="btn-icon sm" title={items.length > 1 ? "Remove these" : "Remove"} onClick={() => items.forEach((x) => onRemove(x.id))}><Icon name="x" /></button>
                    </span>
                    {snoozing === n.id && (
                      <div className="notif-snooze">
                        <span className="muted-inline">Remind me:</span>
                        {snoozeTimes().map(([label, at]) => (
                          <button key={label} className="pick" onClick={() => { items.forEach((x) => onSnooze(x.id, at)); setSnoozing(null); }}>{label}</button>
                        ))}
                      </div>
                    )}
                    {replying === n.id && (
                      <form className="notif-reply" onSubmit={(e) => { e.preventDefault(); if (replyText.trim()) sendReply(n); }}>
                        <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={`Reply to ${n.from || "them"}…`} autoFocus maxLength={500} />
                        <button className="btn btn-primary btn-sm" disabled={!replyText.trim()}>Send</button>
                        {replyMsg && <span className="field-warn">{replyMsg}</span>}
                      </form>
                    )}
                  </div>
                  );
                })}
              </div>
              {snoozed.length > 0 && (
                <details className="notif-snoozed">
                  <summary>💤 Snoozed ({snoozed.length})</summary>
                  {snoozed.map((n) => (
                    <div key={n.id} className="notif read">
                      <span className="notif-text">{n.text}<span className="notif-time">back {new Date(n.snoozeUntil!).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span></span>
                      <span className="notif-tools"><button className="btn-icon sm" title="Show it now" onClick={() => onSnooze(n.id, new Date(Date.now() + 1000).toISOString())}><Icon name="bell" /></button></span>
                    </div>
                  ))}
                </details>
              )}
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
              {tick > 0 && <span key={tick} className="saved-tick" role="status">✓ Saved</span>}
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
              <div className="admin-h">Quiet hours</div>
              <p className="modal-text">Every day, no pop-ups, sounds or phone alerts between these times (notifications still arrive).</p>
              <div className="quiet-row">
                <label className="check-inline"><input type="checkbox" checked={!!settings.quietHours} onChange={(e) => onQuietHours(e.target.checked ? { from: "21:00", to: "07:00" } : null)} /> Quiet hours</label>
                {settings.quietHours && (
                  <>
                    <input type="time" value={settings.quietHours.from} onChange={(e) => e.target.value && onQuietHours({ from: e.target.value, to: settings.quietHours!.to })} aria-label="Quiet from" />
                    <span>to</span>
                    <input type="time" value={settings.quietHours.to} onChange={(e) => e.target.value && onQuietHours({ from: settings.quietHours!.from, to: e.target.value })} aria-label="Quiet until" />
                  </>
                )}
              </div>
              <div className="admin-h">Alerts</div>
              <label className="toggle-row compact">
                <div><strong>Sound when someone @mentions you</strong><span>A short ping, on this device.</span></div>
                <input type="checkbox" role="switch" checked={settings.sound} onChange={(e) => onSound(e.target.checked)} />
                <span className="switch" aria-hidden="true" />
              </label>
              {settings.sound && (
                <div className="chip-grid sound-pick">
                  {SOUNDS.map(([v, l]) => (
                    <button key={v} className={`pick ${settings.soundName === v ? "on" : ""}`} onClick={() => { onSound(true, v); playPing(v); }}>🔊 {l}</button>
                  ))}
                </div>
              )}
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

export const SOUNDS: [string, string][] = [["classic", "Classic ping"], ["bubble", "Bubble"], ["chime", "Chime"], ["retro", "Retro beep"]];
const SOUND_NOTES: Record<string, { notes: number[]; type: OscillatorType }> = {
  classic: { notes: [880, 1320], type: "sine" },
  bubble: { notes: [520, 780, 1040], type: "triangle" },
  chime: { notes: [1318, 1046, 1568], type: "sine" },
  retro: { notes: [660, 660], type: "square" },
};
/** A short ping (no sound file needed). */
export function playPing(variant = "classic") {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const sound = SOUND_NOTES[variant] || SOUND_NOTES.classic;
    sound.notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = sound.type;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(sound.type === "square" ? 0.05 : 0.15, ctx.currentTime + i * 0.12 + 0.02);
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
