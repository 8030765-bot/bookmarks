"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { BookmarksData, Folder, Link } from "@/lib/types";
import ChatPanel from "./ChatPanel";
import CommandPalette, { Icon, PaletteItem } from "./CommandPalette";
import AdminPanel from "./AdminPanel";

const SYNC_MS = 3000;
const ADMIN_PW_KEY = "adminPw";
function faviconUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239aa0b0'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z'/%3E%3C/svg%3E";
  }
}
function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function ensureData(raw: unknown): BookmarksData {
  const d = raw as BookmarksData | null;
  if (!d || !Array.isArray(d.folders)) {
    return { folders: [], activity: [], settings: { theme: "dark", viewMode: "grid", sortBy: "manual" } };
  }
  return {
    rev: d.rev,
    updatedAt: d.updatedAt,
    folders: d.folders.map((f) => ({ ...f, links: Array.isArray(f.links) ? f.links : [] })),
    activity: Array.isArray(d.activity) ? d.activity : [],
    settings: d.settings || { theme: "dark", viewMode: "grid", sortBy: "manual" },
  };
}
type Modal =
  | { type: "addLink" }
  | { type: "addFolder" }
  | { type: "editLink"; folderId: string; link: Link }
  | { type: "editFolder"; folder: Folder }
  | { type: "delete"; kind: "link" | "folder"; folderId: string; linkId?: string; label: string }
  | { type: "adminLogin" }
  | { type: "moveLink"; folderId: string; link: Link }
  | { type: "login" }
  | null;
export default function HomePage() {
  const [data, setData] = useState<BookmarksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "newest" | "clicks" | "manual">("manual");
  const [showCmd, setShowCmd] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fTags, setFTags] = useState("");
  const [fFolderId, setFFolderId] = useState("");
  const [fEmoji, setFEmoji] = useState("📁");
  const [fColor, setFColor] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [fUsername, setFUsername] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };
  const setSafeData = useCallback((raw: unknown) => {
    setData(ensureData(raw));
  }, []);
  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/bookmarks", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load");
      }
      const json = await res.json();
      const normalized = ensureData(json);
      setSafeData(normalized);
      if (normalized.settings?.theme === "light" || normalized.settings?.theme === "dark") {
        setTheme(normalized.settings.theme);
      }
      if (normalized.settings?.viewMode) setViewMode(normalized.settings.viewMode);
      if (normalized.settings?.sortBy) setSortBy(normalized.settings.sortBy as any);
      if (normalized.folders.length && !fFolderId) setFFolderId(normalized.folders[0].id);
    } catch (e: any) {
      setError(e.message || "Could not load bookmarks");
    } finally {
      setLoading(false);
    }
  }, [fFolderId, setSafeData]);
  useEffect(() => { load(); }, [load]);

  // Live sync: poll for a newer revision and swap it in without a reload.
  const revRef = useRef(0);
  useEffect(() => { revRef.current = data?.rev ?? 0; }, [data]);
  useEffect(() => {
    let stopped = false;
    const sync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/bookmarks?rev=${revRef.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        // ignore stale responses that raced with our own saves
        if (!stopped && !json.unchanged && Array.isArray(json.folders) && (json.rev ?? 0) > revRef.current) {
          setSafeData(json);
        }
      } catch {
        // offline for a moment — next tick retries
      }
    };
    const id = setInterval(sync, SYNC_MS);
    document.addEventListener("visibilitychange", sync);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", sync); };
  }, [setSafeData]);

  // stay unlocked across reloads in this tab
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(ADMIN_PW_KEY); } catch {}
    if (saved === null) return;
    fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verifyAdmin", password: saved }),
    })
      .then((r) => {
        if (r.ok) { setAdminUnlocked(true); setAdminPassword(saved!); setAdminOpen(true); }
        else { try { sessionStorage.removeItem(ADMIN_PW_KEY); } catch {} }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUser(j.user || null))
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCmd((s) => !s);
      }
      if (e.key === "Escape") {
        setShowCmd(false);
        setModal(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function api(action: string, payload: Record<string, any> = {}) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (json && Array.isArray(json.folders)) {
        setSafeData(json);
      } else {
        await load();
      }
      return true;
    } catch (e: any) {
      showToast(e.message || "Something went wrong");
      return false;
    } finally {
      setSubmitting(false);
    }
  }
  function resetForm() {
    setFName(""); setFUrl(""); setFNotes(""); setFTags(""); setFEmoji("📁"); setFColor(""); setFPassword("");
  }
  const allTags = useMemo(() => {
    const s = new Set<string>();
    data?.folders?.forEach((f) => f.links?.forEach((l) => l.tags?.forEach((t) => s.add(t))));
    return Array.from(s).sort();
  }, [data]);
  const favorites = useMemo(() => {
    const list: { folderId: string; link: Link }[] = [];
    data?.folders?.forEach((f) => f.links?.forEach((l) => { if (l.favorite) list.push({ folderId: f.id, link: l }); }));
    return list;
  }, [data]);
  const mostVisited = useMemo(() => {
    const list: { folderId: string; link: Link }[] = [];
    data?.folders?.forEach((f) => f.links?.forEach((l) => list.push({ folderId: f.id, link: l })));
    return list.sort((a, b) => (b.link.clicks || 0) - (a.link.clicks || 0)).slice(0, 8);
  }, [data]);
  const totalLinks = data?.folders?.reduce((n, f) => n + (f.links?.length || 0), 0) || 0;
  const totalClicks = data?.folders?.reduce((n, f) => n + (f.links?.reduce((m, l) => m + (l.clicks || 0), 0) || 0), 0) || 0;
  function filterLinks(links: Link[]) {
    let result = [...(links || [])];
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.url.toLowerCase().includes(q) ||
          l.notes?.toLowerCase().includes(q) ||
          l.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (tagFilter) {
      result = result.filter((l) => l.tags?.includes(tagFilter));
    }
    if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "newest") result.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    else if (sortBy === "clicks") result.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
    return result;
  }
  const sortedFolders = useMemo(() => {
    if (!data?.folders) return [];
    const folders = [...data.folders];
    folders.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    return folders;
  }, [data]);

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim() || !fUrl.trim() || !fFolderId) return;
    const ok = await api("addLink", {
      password: adminUnlocked ? adminPassword : undefined,
      folderId: fFolderId,
      name: fName,
      url: fUrl,
      notes: fNotes,
      tags: fTags.split(",").map((t) => t.trim()).filter(Boolean),
      color: fColor || undefined,
    });
    if (ok) { resetForm(); setModal(null); showToast("Website added for everyone!"); }
  }
  async function handleAddFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim()) return;
    const ok = await api("addFolder", { name: fName, emoji: fEmoji || "📁", color: fColor || undefined, password: adminUnlocked ? adminPassword : undefined });
    if (ok) { resetForm(); setModal(null); showToast("Folder created!"); }
  }
  async function handleEditLink(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.type !== "editLink") return;
    const ok = await api("editLink", {
      folderId: modal.folderId,
      linkId: modal.link.id,
      name: fName,
      url: fUrl,
      notes: fNotes,
      tags: fTags.split(",").map((t) => t.trim()).filter(Boolean),
      color: fColor || undefined,
      password: adminUnlocked ? adminPassword : fPassword,
    });
    if (ok) { resetForm(); setModal(null); showToast("Link updated!"); }
  }
  async function handleEditFolder(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.type !== "editFolder") return;
    const ok = await api("editFolder", {
      folderId: modal.folder.id,
      name: fName,
      emoji: fEmoji,
      color: fColor || undefined,
      password: adminUnlocked ? adminPassword : fPassword,
    });
    if (ok) { resetForm(); setModal(null); showToast("Folder updated!"); }
  }
  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.type !== "delete") return;
    const pw = adminUnlocked ? adminPassword : fPassword;
    let ok = false;
    if (modal.kind === "link") {
      ok = await api("deleteLink", { folderId: modal.folderId, linkId: modal.linkId, password: pw });
    } else {
      ok = await api("deleteFolder", { folderId: modal.folderId, password: pw });
    }
    if (ok) { setModal(null); setFPassword(""); showToast("Deleted"); }
  }
  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = await api("verifyAdmin", { password: fPassword });
    if (ok) {
      setAdminUnlocked(true);
      setAdminPassword(fPassword);
      try { sessionStorage.setItem(ADMIN_PW_KEY, fPassword); } catch {}
      setFPassword("");
      setModal(null);
      setAdminOpen(true);
      showToast("Admin unlocked");
    }
  }
  function lockAdmin() {
    setAdminUnlocked(false);
    setAdminPassword("");
    setAdminOpen(false);
    try { sessionStorage.removeItem(ADMIN_PW_KEY); } catch {}
    showToast("Admin locked");
  }
  function toggleAdmin() {
    if (adminUnlocked) setAdminOpen((o) => !o);
    else { setFPassword(""); setModal({ type: "adminLogin" }); }
  }
  const addingLocked = !!data?.settings?.lockAdding && !adminUnlocked;
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: authMode, username: fUsername, password: fPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not log in");
      setUser(json.user);
      setFUsername(""); setFPassword("");
      setModal(null);
      showToast(authMode === "signup" ? `Welcome, ${json.user}!` : `Logged in as ${json.user}`);
    } catch (err: any) {
      showToast(err.message || "Could not log in");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleLogout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {});
    setUser(null);
    showToast("Logged out");
  }
  function openLogin() {
    setFPassword("");
    setAuthMode("login");
    setModal({ type: "login" });
  }
  async function handleMoveLink(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.type !== "moveLink") return;
    const ok = await api("moveLink", {
      folderId: modal.folderId,
      linkId: modal.link.id,
      targetFolderId: fFolderId,
      password: adminUnlocked ? adminPassword : fPassword,
    });
    if (ok) { setModal(null); showToast("Moved!"); }
  }
  async function trackAndOpen(folderId: string, link: Link) {
    api("trackClick", { folderId, linkId: link.id });
    window.open(link.url, "_blank", "noopener,noreferrer");
  }
  function openEditLink(folderId: string, link: Link) {
    setFName(link.name);
    setFUrl(link.url);
    setFNotes(link.notes || "");
    setFTags((link.tags || []).join(", "));
    setFColor(link.color || "");
    setModal({ type: "editLink", folderId, link });
  }
  function openEditFolder(folder: Folder) {
    setFName(folder.name);
    setFEmoji(folder.emoji);
    setFColor(folder.color || "");
    setModal({ type: "editFolder", folder });
  }
  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => showToast("URL copied!"));
  }
  function randomBookmark() {
    if (!data?.folders) return;
    const all: { folderId: string; link: Link }[] = [];
    data.folders.forEach((f) => f.links?.forEach((l) => all.push({ folderId: f.id, link: l })));
    if (!all.length) { showToast("No links yet"); return; }
    const pick = all[Math.floor(Math.random() * all.length)];
    trackAndOpen(pick.folderId, pick.link);
  }
  function openAllInFolder(folder: Folder) {
    folder.links?.forEach((l) => window.open(l.url, "_blank", "noopener,noreferrer"));
    showToast(`Opened ${folder.links?.length || 0} tabs`);
  }
  // close the palette, then run the action
  const cmd = (id: string, label: string, icon: string, run: () => void, hint?: string): PaletteItem => ({
    id, label, hint, icon: <Icon name={icon} />, run: () => { setShowCmd(false); run(); },
  });
  function paletteActions(): PaletteItem[] {
    return [
      cmd("add", "Add website", "plus", () => { resetForm(); if (data?.folders?.[0]) setFFolderId(data.folders[0].id); setModal({ type: "addLink" }); }),
      cmd("folder", "New folder", "folder", () => { resetForm(); setModal({ type: "addFolder" }); }),
      cmd("random", "Random bookmark", "shuffle", randomBookmark),
      cmd("chat", chatOpen ? "Close chat" : "Open chat", "chat", () => setChatOpen((o) => !o)),
      cmd("theme", theme === "dark" ? "Switch to light mode" : "Switch to dark mode", "moon", () => setTheme(theme === "dark" ? "light" : "dark")),
      cmd("view", viewMode === "grid" ? "Show as list" : "Show as grid", "grid", () => setViewMode(viewMode === "grid" ? "list" : "grid")),
      cmd("admin", adminUnlocked ? (adminOpen ? "Close admin panel" : "Open admin panel") : "Admin login", "lock", toggleAdmin),
      user
        ? cmd("auth", `Log out (${user})`, "logout", handleLogout)
        : cmd("auth", "Log in or sign up", "user", openLogin),
    ];
  }
  function linkItem(folder: Folder, link: Link): PaletteItem {
    return {
      id: `${folder.id}:${link.id}`,
      label: link.name,
      hint: folder.name,
      icon: <img src={faviconUrl(link.url)} alt="" width={16} height={16} />,
      run: () => { setShowCmd(false); trackAndOpen(folder.id, link); },
    };
  }

  if (loading) return <div className="status"><p>Loading shared bookmarks…</p></div>;
  if (error && !data) {
    return (
      <div className="app">
        <div className="header"><h1>Made by Theo 7A</h1></div>
        <div className="error-box">
          <strong>Could not load bookmarks.</strong><br /><br />{error}<br /><br />
          Make sure Upstash Redis is connected (see README).
        </div>
      </div>
    );
  }
  const showAdmin = adminUnlocked && adminOpen && !!data;
  return (
    <div className={`shell ${showAdmin ? "with-admin" : ""}`}>
    {showAdmin && (
      <AdminPanel
        data={data!}
        password={adminPassword}
        api={api}
        submitting={submitting}
        onClose={() => setAdminOpen(false)}
        onLock={lockAdmin}
        showToast={showToast}
      />
    )}
    <div className="app" data-theme={theme}>
      <header className="header">
        <h1>{data?.settings?.title || "Made by Theo 7A"}</h1>
        <p>{data?.settings?.subtitle || "Shared school bookmarks — everyone sees the same list"}</p>
        <div className="badge">● Live · changes sync for all visitors</div>
      </header>
      {data?.settings?.announcement && (
        <div className="announcement">{data.settings.announcement}</div>
      )}
      <div className="stats-strip">
        <div className="stat-chip"><strong>{data?.folders?.length || 0}</strong> folders</div>
        <div className="stat-chip"><strong>{totalLinks}</strong> links</div>
        <div className="stat-chip"><strong>{totalClicks}</strong> clicks</div>
        <div className="stat-chip"><strong>{favorites.length}</strong> starred</div>
      </div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => { resetForm(); if (data?.folders?.[0]) setFFolderId(data.folders[0].id); setModal({ type: "addLink" }); }} disabled={!data?.folders?.length || addingLocked} title={addingLocked ? "Adding is locked by an admin" : undefined}>
          ＋ Add Website
        </button>
        <button className="btn btn-secondary" onClick={() => { resetForm(); setModal({ type: "addFolder" }); }} disabled={addingLocked} title={addingLocked ? "Adding is locked by an admin" : undefined}>
          📁 New Folder
        </button>
        <button className="btn btn-secondary" onClick={randomBookmark}>🎲 Random</button>
        <button className="btn btn-secondary" onClick={() => setShowCmd(true)} title="Ctrl+K">Ctrl K</button>
        <button className="btn btn-secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button className="btn btn-secondary" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
          {viewMode === "grid" ? "☰ List" : "▦ Grid"}
        </button>
        <button className={`btn btn-secondary ${showAdmin ? "active" : ""}`} onClick={toggleAdmin}>
          🔐 Admin
        </button>
        {user ? (
          <button className="btn btn-secondary" onClick={handleLogout} title="Log out">
            👤 {user} · Log out
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={openLogin}>👤 Log in</button>
        )}
      </div>
      <div className="search-bar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, URL, notes, tags…"
        />
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="manual">Manual order</option>
          <option value="name">Name A–Z</option>
          <option value="newest">Newest</option>
          <option value="clicks">Most clicked</option>
        </select>
      </div>
      {favorites.length > 0 && (
        <>
          <div className="section-label">⭐ Favorites</div>
          <div className="quick-row">
            {favorites.map(({ folderId, link }) => (
              <button key={link.id} className="quick-chip" onClick={() => trackAndOpen(folderId, link)}>
                <img src={faviconUrl(link.url)} alt="" width={16} height={16} />
                {link.name}
              </button>
            ))}
          </div>
        </>
      )}
      {mostVisited.some((m) => (m.link.clicks || 0) > 0) && (
        <>
          <div className="section-label">🔥 Most visited</div>
          <div className="quick-row">
            {mostVisited.filter((m) => (m.link.clicks || 0) > 0).map(({ folderId, link }) => (
              <button key={link.id} className="quick-chip" onClick={() => trackAndOpen(folderId, link)}>
                <img src={faviconUrl(link.url)} alt="" width={16} height={16} />
                {link.name}
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{link.clicks}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <main>
        {sortedFolders.length === 0 && (
          <div className="empty-folder">No folders yet. Create one to get started!</div>
        )}
        {sortedFolders.map((folder) => {
          const links = filterLinks(folder.links || []);
          const isCollapsed = collapsed[folder.id];
          if (search || tagFilter) {
            if (links.length === 0) return null;
          }
          return (
            <section key={folder.id} className={`folder ${folder.pinned ? "pinned" : ""}`}>
              <div className="folder-header" onClick={() => setCollapsed((c) => ({ ...c, [folder.id]: !c[folder.id] }))}>
                <div className="folder-title">
                  {folder.color && <span className="color-dot" style={{ background: folder.color }} />}
                  <span className="emoji">{folder.emoji}</span>
                  <span>{folder.name}</span>
                  {folder.pinned && <span style={{ fontSize: "0.7rem" }}>📌</span>}
                  <span className="count">{links.length}</span>
                </div>
                <div className="folder-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-icon" title="Open all" onClick={() => openAllInFolder(folder)}>⧉</button>
                  {adminUnlocked && (
                    <button className="btn-icon" title="Edit folder" onClick={() => openEditFolder(folder)}>✎</button>
                  )}
                  <button
                    className="btn-icon danger"
                    title="Delete folder"
                    onClick={() => setModal({ type: "delete", kind: "folder", folderId: folder.id, label: folder.name })}
                  >🗑️</button>
                  <button className="btn-icon" title="Collapse">
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                links.length === 0 ? (
                  <div className="empty-folder">No websites match / empty folder.</div>
                ) : (
                  <div className={`links ${viewMode === "list" ? "list-view" : ""}`}>
                    {links.map((link) => (
                      <div
                        key={link.id}
                        className={`link-card ${link.favorite ? "favorite" : ""}`}
                        style={link.color ? { borderLeft: `3px solid ${link.color}` } : undefined}
                      >
                        <img
                          className="favicon"
                          src={faviconUrl(link.url)}
                          alt=""
                          width={28}
                          height={28}
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                        />
                        <div
                          className="link-info"
                          style={{ cursor: "pointer" }}
                          onClick={() => trackAndOpen(folder.id, link)}
                        >
                          <div className="link-name">
                            {link.favorite && <span>⭐</span>}
                            {link.name}
                          </div>
                          <div className="link-url">{link.url.replace(/^https?:\/\//, "")}</div>
                          <div className="link-meta">
                            {link.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
                            {(link.clicks || 0) > 0 && <span className="clicks-badge">👁 {link.clicks}</span>}
                            {link.notes && <span className="clicks-badge" title={link.notes}>📝</span>}
                          </div>
                        </div>
                        <div className="link-actions">
                          <button
                            className={`star ${link.favorite ? "on" : ""}`}
                            title="Favorite"
                            onClick={() => api("toggleFavorite", { folderId: folder.id, linkId: link.id })}
                          >★</button>
                          <button title="Copy URL" onClick={() => copyUrl(link.url)}>⎘</button>
                          {adminUnlocked && (
                            <>
                              <button title="Edit" onClick={() => openEditLink(folder.id, link)}>✎</button>
                              <button title="Move" onClick={() => { setFFolderId(folder.id); setModal({ type: "moveLink", folderId: folder.id, link }); }}>→</button>
                            </>
                          )}
                          <button
                            className="danger"
                            title="Delete"
                            onClick={() => setModal({ type: "delete", kind: "link", folderId: folder.id, linkId: link.id, label: link.name })}
                          >✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>
          );
        })}
      </main>
      <footer className="footer">
        Made by Theo 7A · Shared with the whole class · Press Ctrl+K for quick search
      </footer>

      {modal?.type === "addLink" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Website</h2>
            <form onSubmit={handleAddLink}>
              <div className="form-group">
                <label>Name</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Cool Site" required autoFocus />
              </div>
              <div className="form-group">
                <label>URL</label>
                <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="https://example.com" required />
              </div>
              <div className="form-group">
                <label>Folder</label>
                <select value={fFolderId} onChange={(e) => setFFolderId(e.target.value)} required>
                  {data?.folders?.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="proxy, school, fun" />
              </div>
              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Any notes…" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Adding…" : "Add for everyone"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "addFolder" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Folder</h2>
            <form onSubmit={handleAddFolder}>
              <div className="form-group">
                <label>Name</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Games" required autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Emoji</label>
                  <input value={fEmoji} onChange={(e) => setFEmoji(e.target.value)} maxLength={4} />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input type="color" value={fColor || "#7c6cff"} onChange={(e) => setFColor(e.target.value)} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Creating…" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "editLink" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Link</h2>
            <form onSubmit={handleEditLink}>
              <div className="form-group">
                <label>Name</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label>URL</label>
                <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Tags</label>
                <input value={fTags} onChange={(e) => setFTags(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
              </div>
              {!adminUnlocked && (
                <div className="form-group">
                  <label>Admin password</label>
                  <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required />
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "editFolder" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Folder</h2>
            <form onSubmit={handleEditFolder}>
              <div className="form-group">
                <label>Name</label>
                <input value={fName} onChange={(e) => setFName(e.target.value)} required autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Emoji</label>
                  <input value={fEmoji} onChange={(e) => setFEmoji(e.target.value)} maxLength={4} />
                </div>
                <div className="form-group">
                  <label>Color</label>
                  <input type="color" value={fColor || "#7c6cff"} onChange={(e) => setFColor(e.target.value)} />
                </div>
              </div>
              {!adminUnlocked && (
                <div className="form-group">
                  <label>Admin password</label>
                  <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required />
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "moveLink" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Move “{modal.link.name}”</h2>
            <form onSubmit={handleMoveLink}>
              <div className="form-group">
                <label>Target folder</label>
                <select value={fFolderId} onChange={(e) => setFFolderId(e.target.value)} required>
                  {data?.folders?.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                </select>
              </div>
              {!adminUnlocked && (
                <div className="form-group">
                  <label>Admin password</label>
                  <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required />
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Move</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "delete" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete {modal.kind === "link" ? "website" : "folder"}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              Delete <strong>{modal.label}</strong>? This affects everyone.
            </p>
            <form onSubmit={handleDelete}>
              {!adminUnlocked && (
                <div className="form-group">
                  <label>Admin password</label>
                  <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required autoFocus placeholder="Enter password" />
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={submitting}>{submitting ? "Deleting…" : "Delete"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "adminLogin" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>🔐 Admin Login</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginBottom: "1rem" }}>
              Enter the same password used for deleting items.
            </p>
            <form onSubmit={handleAdminLogin}>
              <div className="form-group">
                <label>Admin password</label>
                <input type="password" value={fPassword} onChange={(e) => setFPassword(e.target.value)} required autoFocus />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Unlock</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modal?.type === "login" && (
        <div className="modal-overlay" onClick={() => !submitting && setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{authMode === "login" ? "👤 Log in" : "👤 Create account"}</h2>
            <div className="auth-tabs">
              <button type="button" className={authMode === "login" ? "on" : ""} onClick={() => setAuthMode("login")}>Log in</button>
              <button type="button" className={authMode === "signup" ? "on" : ""} onClick={() => setAuthMode("signup")}>Sign up</button>
            </div>
            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label>Username</label>
                <input value={fUsername} onChange={(e) => setFUsername(e.target.value)} required autoFocus autoComplete="username" maxLength={20} />
                {authMode === "signup" && <div className="hint">3–20 letters, numbers or _. This is the name others see in chat.</div>}
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                />
                {authMode === "signup" && <div className="hint">At least 6 characters. Don&apos;t reuse a password from another site.</div>}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "…" : authMode === "login" ? "Log in" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ChatPanel
        open={chatOpen}
        setOpen={setChatOpen}
        chatEnabled={data?.settings?.chatEnabled !== false}
        user={user}
        adminPassword={adminUnlocked ? adminPassword : null}
        onNeedLogin={openLogin}
        showToast={showToast}
      />
      {showCmd && (() => {
        const actions = paletteActions();
        const folderById = new Map((data?.folders || []).map((f) => [f.id, f]));
        return (
          <CommandPalette
            onClose={() => setShowCmd(false)}
            chipLabel="Theo's Bookmarks"
            status={{
              title: user ? `Logged in as ${user}` : "Not logged in",
              sub: `${totalLinks} links · ${data?.folders?.length || 0} folders · ${totalClicks} clicks`,
              online: !!user,
              run: () => { setShowCmd(false); if (!user) openLogin(); else setChatOpen(true); },
            }}
            shortcuts={actions}
            sections={[
              { title: "Actions", items: actions },
              {
                title: "Most visited",
                emptyQueryOnly: true,
                items: mostVisited
                  .filter((m) => (m.link.clicks || 0) > 0)
                  .slice(0, 5)
                  .map((m) => linkItem(folderById.get(m.folderId)!, m.link)),
              },
              {
                title: "Links",
                queryOnly: true,
                items: (data?.folders || []).flatMap((f) => (f.links || []).map((l) => linkItem(f, l))),
              },
            ]}
          />
        );
      })()}
      {toast && <div className="toast">{toast}</div>}
    </div>
    </div>
  );
}
