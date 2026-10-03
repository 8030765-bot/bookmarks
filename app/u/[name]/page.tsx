"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActivityEntry } from "@/lib/types";
import Favicon from "../../components/Favicon";
import Markdown from "../../components/Markdown";
import { Icon } from "../../components/Icon";
import { Avatar, roleClass } from "../../components/People";
import type { Profile } from "../../components/Personal";
import { ageLabel, safeHref, timeAgo } from "../../components/ui";

interface LinkLite { id: string; name: string; url: string; folder: string; emoji: string }
interface FullProfile {
  username: string;
  profile?: Profile;
  role?: string | null;
  joined?: string;
  added?: number;
  likesReceived?: number;
  social?: { followers: number; following: number; kudos: number; youFollow: boolean; followsYou: boolean; mutual: string[] };
  lastSeen?: number;
  recent?: LinkLite[];
  showcase?: LinkLite[];
  favFolders?: { id: string; name: string; emoji: string }[];
  activity?: ActivityEntry[];
  self?: boolean;
  hidden?: boolean;
  membersOnly?: boolean;
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({}));
}

/** Someone's public profile page. */
export default function ProfilePage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params?.name || "");
  const [p, setP] = useState<FullProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    fetch(`/api/profile?user=${encodeURIComponent(name)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.username ? setP(j) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [name]);
  useEffect(() => {
    load();
    fetch("/api/auth", { cache: "no-store" }).then((r) => r.json()).then((j) => setMe(j.user || null)).catch(() => {});
  }, [load]);
  useEffect(() => { if (p) document.title = `${p.profile?.displayName || p.username} · Theo's Bookmarks`; }, [p]);

  const pr = p?.profile || {};
  const online = !!p?.lastSeen && Date.now() - p.lastSeen < 90_000;
  const share = () => navigator.clipboard.writeText(location.href).then(() => setMsg("Link to this profile copied")).catch(() => setMsg(location.href));

  return (
    <div className="app profile-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/people"><Icon name="users" /> People</Link>
      </div>
      {!p && !missing && <div className="skeleton skel-row" style={{ height: 160 }} />}
      {missing && <div className="empty-state"><h3>No one called “{name}”</h3><p>Maybe they changed their name?</p></div>}
      {p && (p.hidden || p.membersOnly) && (
        <div className="empty-state">
          <div className="empty-emoji">🔒</div>
          <h3>{p.username}</h3>
          <p>{p.hidden ? "This profile is private." : "Log in to see this profile."}</p>
        </div>
      )}
      {p && !p.hidden && !p.membersOnly && (
        <>
          <header className={`pp-hero banner-${pr.banner || "none"}`} style={{ "--pc": pr.color || "var(--accent)" } as React.CSSProperties}>
            <Avatar name={p.username} profile={pr} size={84} online={online} />
            <div className="pp-names">
              <h1 className={roleClass(p.role)}>{pr.displayName || p.username}</h1>
              <div className="pp-handle">@{p.username}{p.role && <span className={`pill role-${p.role}`}>{p.role}</span>}{p.social?.followsYou && <span className="pill">follows you</span>}</div>
              {pr.status && <div className="pp-status">{pr.statusEmoji} {pr.status}</div>}
              <div className="pp-meta">
                {p.joined && <span>Joined {ageLabel(p.joined)}</span>}
                {p.lastSeen && <span>{online ? "🟢 Online now" : `Active ${timeAgo(new Date(p.lastSeen).toISOString())}`}</span>}
              </div>
            </div>
            <div className="pp-actions">
              {me && !p.self && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={async () => { await post({ action: "follow", username: p.username, on: !p.social?.youFollow }); load(); }}>
                    {p.social?.youFollow ? "Following ✓" : "Follow"}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={async () => { const j = await post({ action: "kudos", username: p.username }); setMsg(j.error || `Kudos sent ⭐ — ${j.left} left today`); load(); }}>⭐ Kudos</button>
                  <button className="btn btn-secondary btn-sm" title="Hide their chat messages from you" onClick={async () => { if (confirm(`Block ${p.username}? Their chat messages will be hidden from you.`)) { await post({ action: "block", username: p.username, on: true }); setMsg(`Blocked ${p.username}`); } }}>Block</button>
                </>
              )}
              {p.self && <Link className="btn btn-primary btn-sm" href="/?edit=profile"><Icon name="edit" /> Edit profile</Link>}
              <button className="btn btn-secondary btn-sm" onClick={share}><Icon name="share" /> Share</button>
            </div>
          </header>
          {msg && <p className="hint pp-msg">{msg}</p>}

          <div className="profile-stats five">
            <div><strong>{p.added || 0}</strong><span>websites added</span></div>
            <div><strong>{p.likesReceived || 0}</strong><span>likes received</span></div>
            <div><strong>{p.social?.followers || 0}</strong><span>followers</span></div>
            <div><strong>{p.social?.following || 0}</strong><span>following</span></div>
            <div><strong>{p.social?.kudos || 0}</strong><span>kudos ⭐</span></div>
          </div>

          {pr.bio && <section className="pp-section"><Markdown text={pr.bio} /></section>}
          {pr.into?.length ? (
            <section className="pp-section">
              <div className="admin-h">Into</div>
              <div className="chip-grid">{pr.into.map((t) => <Link key={t} className="pick" href={`/?q=${encodeURIComponent(`tag:${t}`)}`}>#{t}</Link>)}</div>
            </section>
          ) : null}
          {p.social?.mutual?.length ? (
            <section className="pp-section">
              <div className="admin-h">You both follow</div>
              <div className="chip-grid">{p.social.mutual.map((u) => <Link key={u} className="pick" href={`/u/${u}`}>{u}</Link>)}</div>
            </section>
          ) : null}
          {[["Showing off", p.showcase], ["Recently added", p.recent]].map(([title, list]) => (list as LinkLite[] | undefined)?.length ? (
            <section key={title as string} className="pp-section">
              <div className="admin-h">{title as string}</div>
              <div className="cards">
                {(list as LinkLite[]).map((l) => (
                  <a key={l.id} className="card" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">
                    <span className="card-main">
                      <span className="card-icon"><Favicon url={l.url} name={l.name} size={22} /></span>
                      <span className="card-body">
                        <span className="card-name"><span className="card-title">{l.name}</span></span>
                        <span className="card-host">{l.emoji} {l.folder}</span>
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null)}
          {p.favFolders?.length ? (
            <section className="pp-section">
              <div className="admin-h">Favorite folders</div>
              <div className="chip-grid">{p.favFolders.map((f) => <Link key={f.id} className="pick" href={`/#folder-${f.id}`}>{f.emoji} {f.name}</Link>)}</div>
            </section>
          ) : null}
          {p.self && (
            <section className="pp-section">
              <div className="admin-h">Your recent activity</div>
              {!p.activity?.length && <div className="admin-empty">Nothing yet — add a website to get started.</div>}
              <div className="timeline">
                {p.activity?.map((a) => (
                  <div key={a.id} className="timeline-item">
                    <span className={`tl-dot ${a.action}`} />
                    <span className="tl-text">{a.detail}</span>
                    <span className="tl-time">{timeAgo(a.at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
