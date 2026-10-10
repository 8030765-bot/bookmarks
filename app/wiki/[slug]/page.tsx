"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Icon } from "../../components/Icon";
import Markdown from "../../components/Markdown";
import { timeAgo } from "../../components/ui";
import { speak } from "../../components/Fun";

interface WikiPage { slug: string; title: string; body: string; updatedBy: string; updatedAt: string; locked?: boolean; history: { body: string; by: string; at: string }[] }

export default function WikiPageView() {
  return <Suspense fallback={<div className="app"><div className="skeleton skel-row" /></div>}><WikiInner /></Suspense>;
}

function WikiInner() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const fresh = params.get("new");
  const [page, setPage] = useState<WikiPage | null | undefined>(undefined);
  const [me, setMe] = useState<{ user: string | null; role: string | null }>({ user: null, role: null });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [locked, setLocked] = useState(false);
  const [preview, setPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((j) => setMe({ user: j.user || null, role: j.role || null })).catch(() => {});
    fetch(`/api/wiki?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.status === 404 ? null : r.json()))
      .then((j) => {
        const p = j?.page || null;
        setPage(p);
        if (p) { document.title = `${p.title} · Wiki`; setTitle(p.title); setBody(p.body); setLocked(!!p.locked); }
        else { setTitle(fresh || slug.replace(/-/g, " ")); setEditing(!!fresh); }
      })
      .catch(() => setPage(null));
  }, [slug, fresh]);

  const staff = !!me.role;
  const canEdit = !!me.user && (!page?.locked || staff);
  async function save() {
    setError("");
    const res = await fetch("/api/wiki", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, title, body, ...(staff ? { locked } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setError(j.error || "Couldn't save");
    setPage(j.page);
    setEditing(false);
    setPreview(false);
  }
  async function remove() {
    if (!confirm("Delete this page for everyone?")) return;
    const res = await fetch("/api/wiki", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", slug }) });
    if (res.ok) location.href = "/wiki";
  }

  return (
    <div className="app wiki-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/wiki"><Icon name="up" /> All pages</Link>
        {page && canEdit && !editing && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}><Icon name="edit" /> Edit</button>}
        {page && staff && <button className="btn btn-danger btn-sm" onClick={remove}><Icon name="trash" /> Delete</button>}
      </div>
      {page === undefined && <div className="skeleton skel-row" />}
      {page === null && !editing && (
        <div className="empty-state">
          <p>There’s no page called “{title}” yet.</p>
          {me.user ? <button className="btn btn-primary" onClick={() => setEditing(true)}>Write it</button> : <p className="muted-inline">Log in to write it.</p>}
        </div>
      )}
      {editing ? (
        <div className="wiki-edit">
          <input className="wiki-title-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={80} />
          <div className="seg small">
            <button className={!preview ? "on" : ""} onClick={() => setPreview(false)}>Write</button>
            <button className={preview ? "on" : ""} onClick={() => setPreview(true)}>Preview</button>
          </div>
          {preview ? <Markdown text={body} className="wiki-body" /> : (
            <textarea className="wiki-text" value={body} onChange={(e) => setBody(e.target.value)} rows={18} maxLength={20000}
              placeholder={"Write in Markdown:\n# Heading\n**bold**, *italic*, `code`\n- a list\n[a link](https://example.com)"} />
          )}
          {staff && <label className="check-row"><input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Lock — only moderators can edit</label>}
          {error && <div className="form-error">{error}</div>}
          <div className="admin-toolbar end">
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); if (page) { setTitle(page.title); setBody(page.body); } }}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!title.trim()} onClick={save}>Save page</button>
          </div>
        </div>
      ) : page && (
        <article className="wiki-article">
          <h1>{page.locked && "🔒 "}{page.title}</h1>
          <div className="muted-inline">Last edited by {page.updatedBy} {timeAgo(page.updatedAt)}{page.history.length > 0 && <> · <button className="link-btn" onClick={() => setShowHistory((v) => !v)}>{page.history.length} earlier version{page.history.length === 1 ? "" : "s"}</button></>}</div>
          <button className="link-btn" onClick={() => speak(`${page.title}. ${page.body.replace(/[#*_`>\[\]()-]/g, " ")}`)}>🔊 Read aloud</button>
          <Markdown text={page.body || "*This page is empty.*"} className="wiki-body" />
          {showHistory && (
            <div className="wiki-history">
              {page.history.map((h, i) => (
                <details key={i}>
                  <summary>{h.by} · {timeAgo(h.at)}</summary>
                  <Markdown text={h.body} className="wiki-body" />
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => { setBody(h.body); setEditing(true); }}>Bring this version back</button>}
                </details>
              ))}
            </div>
          )}
        </article>
      )}
    </div>
  );
}
