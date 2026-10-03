"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";
import { Avatar, roleClass } from "../components/People";
import { timeAgo } from "../components/ui";

interface Person {
  username: string;
  displayName?: string;
  avatar?: string;
  color?: string;
  border?: string;
  status?: string;
  statusEmoji?: string;
  into?: string[];
  role?: string | null;
  joined: string;
  added: number;
  kudos: number;
  lastSeen?: number;
}
type SortBy = "contributions" | "newest" | "kudos" | "name" | "active";

/** Everyone on the site (except people who hide their profile). */
export default function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [following, setFollowing] = useState<string[]>([]);
  const [sort, setSort] = useState<SortBy>("contributions");
  const [q, setQ] = useState("");
  useEffect(() => {
    document.title = "People · Theo's Bookmarks";
    fetch("/api/people", { cache: "no-store" }).then((r) => r.json()).then((j) => setPeople(j.people || [])).catch(() => setPeople([]));
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((j) => { setMe(j.user || null); setFollowing(j.following || []); }).catch(() => {});
  }, []);
  const online = (p: Person) => !!p.lastSeen && Date.now() - p.lastSeen < 90_000;
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = (people || []).filter((p) => !term || `${p.username} ${p.displayName || ""} ${(p.into || []).join(" ")}`.toLowerCase().includes(term));
    const by: Record<SortBy, (a: Person, b: Person) => number> = {
      contributions: (a, b) => b.added - a.added || b.kudos - a.kudos,
      newest: (a, b) => b.joined.localeCompare(a.joined),
      kudos: (a, b) => b.kudos - a.kudos,
      name: (a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username),
      active: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0),
    };
    return [...filtered].sort(by[sort]);
  }, [people, sort, q]);
  // people you might like to follow: busy contributors you don't follow yet
  const suggested = useMemo(
    () => (people || []).filter((p) => me && p.username.toLowerCase() !== me.toLowerCase() && !following.includes(p.username.toLowerCase()) && p.added > 0)
      .sort((a, b) => b.added - a.added).slice(0, 4),
    [people, me, following]
  );
  async function follow(username: string) {
    const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "follow", username, on: true }) });
    const j = await res.json().catch(() => ({}));
    if (j.following) setFollowing(j.following);
  }

  return (
    <div className="app people-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
      </div>
      <header className="hero">
        <h1>People</h1>
        <p>{people ? `${people.length} members` : "Loading…"}{people ? ` · ${people.filter(online).length} online now` : ""}</p>
      </header>
      {suggested.length > 0 && (
        <section className="pp-section">
          <div className="admin-h">People to follow</div>
          <div className="people-grid">
            {suggested.map((p) => (
              <div key={p.username} className="person suggested">
                <Link href={`/u/${p.username}`} className="person-main">
                  <Avatar name={p.username} profile={p} size={40} online={online(p)} />
                  <span><strong className={roleClass(p.role)}>{p.displayName || p.username}</strong><em>{p.added} websites added</em></span>
                </Link>
                <button className="btn btn-secondary btn-sm" onClick={() => follow(p.username)}>Follow</button>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="actions-row">
        <input className="people-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or topics…" aria-label="Search people" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortBy)} aria-label="Sort people">
          <option value="contributions">Most websites added</option>
          <option value="kudos">Most kudos</option>
          <option value="active">Recently active</option>
          <option value="newest">Newest members</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      {!people && [0, 1, 2].map((i) => <div key={i} className="skeleton skel-row" />)}
      <div className="people-grid">
        {list.map((p) => (
          <Link key={p.username} href={`/u/${p.username}`} className="person">
            <span className="person-main">
              <Avatar name={p.username} profile={p} size={44} online={online(p)} />
              <span>
                <strong className={roleClass(p.role)}>{p.displayName || p.username}</strong>
                <em>@{p.username}{p.role ? ` · ${p.role}` : ""}</em>
                {p.status && <em>{p.statusEmoji} {p.status}</em>}
              </span>
            </span>
            <span className="person-stats">
              <span><strong>{p.added}</strong> added</span>
              <span><strong>{p.kudos}</strong> ⭐</span>
              <span>{online(p) ? "🟢 online" : p.lastSeen ? `active ${timeAgo(new Date(p.lastSeen).toISOString())}` : `joined ${timeAgo(p.joined)}`}</span>
            </span>
            {p.into?.length ? <span className="person-into">{p.into.map((t) => `#${t}`).join(" ")}</span> : null}
          </Link>
        ))}
      </div>
      {people && list.length === 0 && <div className="empty-state"><p>No one matches that.</p></div>}
    </div>
  );
}
