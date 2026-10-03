"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../components/Icon";
import { timeAgo } from "../components/ui";

interface PageInfo { slug: string; title: string; updatedBy: string; updatedAt: string; locked?: boolean }

/** The wiki: how-tos and guides anyone can write. */
export default function WikiIndex() {
  const router = useRouter();
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  useEffect(() => {
    document.title = "Wiki · Theo's Bookmarks";
    fetch("/api/wiki", { cache: "no-store" }).then((r) => r.json()).then((j) => setPages(j.pages || [])).catch(() => setPages([]));
  }, []);
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  const list = (pages || []).filter((p) => !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="app wiki-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/community"><Icon name="users" /> Community</Link>
      </div>
      <header className="hero">
        <h1>Wiki</h1>
        <p>Guides and how-tos for the websites here. Anyone with an account can write or fix a page.</p>
      </header>
      <div className="actions-row">
        <input className="people-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page…" aria-label="Find a page" />
        <form className="status-row" onSubmit={(e) => { e.preventDefault(); if (slug) router.push(`/wiki/${slug}?new=${encodeURIComponent(title.trim())}`); }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New page title" maxLength={80} />
          <button className="btn btn-primary btn-sm" disabled={!slug}><Icon name="plus" /> New page</button>
        </form>
      </div>
      {!pages && <div className="skeleton skel-row" />}
      {pages && list.length === 0 && <div className="empty-state small"><p>{pages.length ? "No page matches that." : "No pages yet — start the first one!"}</p></div>}
      <div className="wiki-list">
        {list.map((p) => (
          <Link key={p.slug} href={`/wiki/${p.slug}`} className="wiki-item">
            <strong>{p.locked && "🔒 "}{p.title}</strong>
            <span className="muted-inline">edited by {p.updatedBy} {timeAgo(p.updatedAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
