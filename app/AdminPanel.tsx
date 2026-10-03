"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarksData, ChatMessage, Folder, Link, Suggestion } from "@/lib/types";
import { Icon } from "./CommandPalette";
import { suggestionSummary } from "./SuggestModal";
import Favicon from "./components/Favicon";
import { parseBookmarksHtml } from "./components/Community";

type Role = "owner" | "admin" | "mod" | null;
type Tab = "overview" | "suggestions" | "polls" | "links" | "folders" | "chat" | "users" | "roles" | "site" | "data" | "activity";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "chart" },
  { id: "suggestions", label: "Suggestions", icon: "bulb" },
  { id: "polls", label: "Polls", icon: "poll" },
  { id: "links", label: "Links", icon: "link" },
  { id: "folders", label: "Folders", icon: "folder" },
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "users", label: "Users", icon: "users" },
  { id: "roles", label: "Access", icon: "lock" },
  { id: "site", label: "Site", icon: "settings" },
  { id: "data", label: "Data", icon: "database" },
  { id: "activity", label: "Activity", icon: "clock" },
];

type Api = (action: string, payload?: Record<string, any>) => Promise<boolean>;
interface AuditEntry { at: string; actor: string; role: string; action: string; detail?: string }
interface AdminInfo {
  users: { username: string; createdAt: string }[];
  banned: string[];
  messageCount: number;
  suggestions: Suggestion[];
  roles: Record<string, Role>;
  audit: AuditEntry[];
  me: { user: string | null; role: Role; ownerExists: boolean };
}
type LinkRow = { folder: Folder; link: Link };

function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function normUrl(url: string) {
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

export default function AdminPanel({
  data,
  password,
  api,
  submitting,
  onClose,
  onLock,
  showToast,
  applyData,
  role,
}: {
  data: BookmarksData;
  password: string;
  api: Api;
  role: Role;
  submitting: boolean;
  onClose: () => void;
  onLock: () => void;
  showToast: (msg: string) => void;
  /** push fresh bookmarks into the page after a server-side change */
  applyData: (data: BookmarksData) => void;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (sessionStorage.getItem("adminTab") as Tab) || "overview";
    } catch {
      return "overview";
    }
  });
  useEffect(() => {
    try { sessionStorage.setItem("adminTab", tab); } catch {}
  }, [tab]);

  const run: Api = (action, payload = {}) => api(action, { ...payload, password });

  // accounts + chat moderation live outside the bookmarks blob
  const [info, setInfo] = useState<AdminInfo | null>(null);
  const admin = useCallback(
    async (action: string, payload: Record<string, any> = {}) => {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Request failed");
      return json;
    },
    [password]
  );
  const refreshInfo = useCallback(async () => {
    try { setInfo(await admin("overview")); } catch {}
  }, [admin]);
  useEffect(() => {
    refreshInfo();
    const id = setInterval(() => { if (document.visibilityState === "visible") refreshInfo(); }, 10000);
    return () => clearInterval(id);
  }, [refreshInfo]);

  const allLinks: LinkRow[] = useMemo(
    () => data.folders.flatMap((folder) => folder.links.map((link) => ({ folder, link }))),
    [data]
  );
  const totalClicks = allLinks.reduce((n, r) => n + (r.link.clicks || 0), 0);
  const pending = info?.suggestions.filter((x) => x.status === "pending").length ?? 0;

  return (
    <aside className="admin-panel" aria-label="Admin panel">
      <div className="admin-head">
        <div>
          <div className="admin-title">{role ? role[0].toUpperCase() + role.slice(1) : "Admin"}</div>
          <div className="admin-sub">
            <span className="live-dot" /> Live · rev {data.rev ?? 0}
            {data.updatedAt && <> · saved {timeAgo(data.updatedAt)}</>}
          </div>
        </div>
        <div className="admin-head-actions">
          <button className="btn-icon" title="Lock admin" onClick={onLock}><Icon name="lock" /></button>
          <button className="btn-icon" title="Close panel" onClick={onClose}><Icon name="x" /></button>
        </div>
      </div>
      <nav className="admin-tabs">
        {TABS.filter((t) => {
          if (t.id === "roles") return role === "owner";
          if (role === "mod") return ["overview", "suggestions", "chat", "users"].includes(t.id);
          return true;
        }).map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)} title={t.label}>
            {t.id === "suggestions" && pending > 0 && <span className="tab-badge">{pending}</span>}
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="admin-body">
        {tab === "overview" && (
          <OverviewTab data={data} rows={allLinks} totalClicks={totalClicks} info={info} goTo={setTab} />
        )}
        {tab === "suggestions" && (
          <SuggestionsTab data={data} info={info} admin={admin} setInfo={setInfo} applyData={applyData} showToast={showToast} />
        )}
        {tab === "polls" && <PollsTab data={data} run={run} submitting={submitting} showToast={showToast} />}
        {tab === "links" && <LinksTab data={data} rows={allLinks} run={run} submitting={submitting} showToast={showToast} />}
        {tab === "folders" && <FoldersTab data={data} run={run} submitting={submitting} showToast={showToast} />}
        {tab === "chat" && (
          <ChatTab data={data} password={password} run={run} admin={admin} info={info} refreshInfo={refreshInfo} showToast={showToast} />
        )}
        {tab === "users" && <UsersTab admin={admin} info={info} refreshInfo={refreshInfo} showToast={showToast} />}
        {tab === "roles" && <RolesTab admin={admin} info={info} refreshInfo={refreshInfo} showToast={showToast} />}
        {tab === "site" && <SiteTab data={data} run={run} submitting={submitting} showToast={showToast} />}
        {tab === "data" && <DataTab data={data} run={run} showToast={showToast} />}
        {tab === "activity" && <ActivityTab data={data} audit={info?.audit} />}
      </div>
    </aside>
  );
}

/* ---------- Access / roles (owner only) ---------- */
const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", mod: "Moderator" };
function RolesTab({ admin, info, refreshInfo, showToast }: { admin: (a: string, p?: Record<string, any>) => Promise<any>; info: AdminInfo | null; refreshInfo: () => void; showToast: (m: string) => void }) {
  const [q, setQ] = useState("");
  if (!info) return <div className="admin-empty">Loading…</div>;
  const me = info.me.user?.toLowerCase();
  const act = async (action: string, username: string, extra: Record<string, any>, done: string) => {
    try { await admin(action, { username, ...extra }); refreshInfo(); showToast(done); }
    catch (e: any) { showToast(e.message); }
  };
  const users = info.users.filter((u) => u.username.toLowerCase().includes(q.toLowerCase()));
  const roleOf = (name: string): Role => info.roles[name.toLowerCase()] || null;
  return (
    <>
      <p className="modal-text">Give trusted classmates access. <strong>Admins</strong> can do everything except manage access. <strong>Moderators</strong> only handle chat, suggestions and users.</p>
      <div className="admin-toolbar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${info.users.length} accounts…`} /></div>
      <div className="admin-list">
        {users.length === 0 && <div className="admin-empty">No accounts.</div>}
        {users.map((u) => {
          const r = roleOf(u.username);
          const isMe = u.username.toLowerCase() === me;
          return (
            <div key={u.username} className="admin-row">
              <span className="avatar">{u.username[0]?.toUpperCase()}</span>
              <div className="row-main">
                <div className="row-title">{u.username}{isMe && <em> (you)</em>}{r && <span className={`pill role-${r}`}>{ROLE_LABELS[r]}</span>}</div>
                <div className="row-sub">joined {timeAgo(u.createdAt)}</div>
              </div>
              {r === "owner" ? (
                <span className="row-sub">owner</span>
              ) : isMe ? (
                <span className="row-sub">—</span>
              ) : (
                <div className="row-actions">
                  <select
                    value={r || ""}
                    onChange={(e) => act("setRole", u.username, { role: e.target.value || null }, `${u.username} is now ${e.target.value ? ROLE_LABELS[e.target.value] : "a member"}`)}
                    aria-label={`Role for ${u.username}`}
                  >
                    <option value="">Member</option>
                    <option value="mod">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                  {r === "admin" && (
                    <button className="btn btn-secondary btn-sm" title="Hand over ownership" onClick={() => { if (confirm(`Make ${u.username} the OWNER? You become an admin and can't undo this yourself.`)) act("transferOwner", u.username, {}, `${u.username} is now the owner`); }}>Make owner</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Overview ---------- */
function OverviewTab({
  data, rows, totalClicks, info, goTo,
}: { data: BookmarksData; rows: LinkRow[]; totalClicks: number; info: AdminInfo | null; goTo: (t: Tab) => void }) {
  const top = [...rows].sort((a, b) => (b.link.clicks || 0) - (a.link.clicks || 0)).slice(0, 5);
  const maxClicks = Math.max(1, ...top.map((r) => r.link.clicks || 0));
  const maxLinks = Math.max(1, ...data.folders.map((f) => f.links.length));
  const neverClicked = rows.filter((r) => !r.link.clicks).length;
  const stats = [
    { label: "Links", value: rows.length, tab: "links" as Tab },
    { label: "Folders", value: data.folders.length, tab: "folders" as Tab },
    { label: "Clicks", value: totalClicks, tab: "links" as Tab },
    { label: "Users", value: info?.users.length ?? "–", tab: "users" as Tab },
    { label: "Messages", value: info?.messageCount ?? "–", tab: "chat" as Tab },
    { label: "Never clicked", value: neverClicked, tab: "links" as Tab },
    { label: "Suggestions waiting", value: info ? info.suggestions.filter((x) => x.status === "pending").length : "–", tab: "suggestions" as Tab },
  ];
  return (
    <>
      <div className="stat-grid">
        {stats.map((s) => (
          <button key={s.label} className="stat-card" onClick={() => goTo(s.tab)}>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </button>
        ))}
      </div>
      <h3 className="admin-h">Top links</h3>
      {top.map(({ folder, link }) => (
        <div key={link.id} className="bar-row">
          <span className="bar-label">{link.name}<em>{folder.name}</em></span>
          <span className="bar"><span style={{ width: `${((link.clicks || 0) / maxClicks) * 100}%` }} /></span>
          <span className="bar-num">{link.clicks || 0}</span>
        </div>
      ))}
      <h3 className="admin-h">Links per folder</h3>
      {data.folders.map((f) => (
        <div key={f.id} className="bar-row">
          <span className="bar-label">{f.emoji} {f.name}</span>
          <span className="bar"><span style={{ width: `${(f.links.length / maxLinks) * 100}%`, background: f.color || undefined }} /></span>
          <span className="bar-num">{f.links.length}</span>
        </div>
      ))}
      <h3 className="admin-h">Latest activity</h3>
      <ActivityList items={(data.activity || []).slice(0, 6)} />
      <button className="btn btn-secondary btn-sm admin-more" onClick={() => goTo("activity")}>See all activity</button>
    </>
  );
}

/* ---------- Suggestions ---------- */
const KIND_TEXT: Record<Suggestion["kind"], string> = {
  addLink: "Add website",
  editLink: "Change website",
  removeLink: "Remove website",
  other: "Idea",
};
function SuggestionsTab({
  data, info, admin, setInfo, applyData, showToast,
}: {
  data: BookmarksData; info: AdminInfo | null; admin: (a: string, p?: Record<string, any>) => Promise<any>;
  setInfo: React.Dispatch<React.SetStateAction<AdminInfo | null>>; applyData: (d: BookmarksData) => void; showToast: (m: string) => void;
}) {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  // admin tweaks before approving, keyed by suggestion id
  const [edits, setEdits] = useState<Record<string, { name?: string; url?: string; folderId?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (!info) return <div className="admin-empty">Loading suggestions…</div>;

  const list = info.suggestions.filter((x) => filter === "all" || x.status === filter);
  const count = (st: string) => info.suggestions.filter((x) => x.status === st).length;
  const findLink = (x: Suggestion) => data.folders.find((f) => f.id === x.folderId)?.links.find((l) => l.id === x.linkId);
  const folderName = (id?: string) => {
    const f = data.folders.find((ff) => ff.id === id);
    return f ? `${f.emoji} ${f.name}` : "a deleted folder";
  };

  async function act(action: string, x: Suggestion, extra: Record<string, unknown> = {}) {
    setBusy(x.id);
    try {
      const json = await admin(action, { id: x.id, ...extra });
      setInfo((i) => (i ? { ...i, suggestions: json.suggestions } : i));
      if (json.data) applyData(json.data);
      return true;
    } catch (e: any) {
      showToast(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="seg">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "rejected" ? "Declined" : f[0].toUpperCase() + f.slice(1)}
            {f !== "all" && <span>{count(f)}</span>}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <div className="admin-empty">{filter === "pending" ? "All caught up — no suggestions waiting." : "Nothing here."}</div>
      )}
      {list.map((x) => {
        const e = edits[x.id] || {};
        const link = findLink(x);
        const gone = (x.kind === "editLink" || x.kind === "removeLink") && !link;
        const setE = (patch: typeof e) => setEdits((all) => ({ ...all, [x.id]: { ...e, ...patch } }));
        return (
          <div key={x.id} className={`sugg-card ${x.status}`}>
            <div className="sugg-top">
              <span className="avatar sm">{x.user[0]?.toUpperCase()}</span>
              <strong>{x.user}</strong>
              <span className="sugg-kind">{KIND_TEXT[x.kind]}</span>
              <span className="row-sub inline">{timeAgo(x.createdAt)}</span>
            </div>

            {x.status !== "pending" ? (
              <div className="sugg-body">
                {suggestionSummary(x)}
                <div className="row-sub">
                  <span className={`pill ${x.status}`}>{x.status === "rejected" ? "declined" : x.status}</span>
                  {" "}{timeAgo(x.resolvedAt)}{x.resolvedNote && ` · “${x.resolvedNote}”`}
                </div>
              </div>
            ) : (
              <div className="sugg-body">
                {x.kind === "addLink" && (
                  <div className="sugg-fields">
                    <input value={e.name ?? x.name ?? ""} onChange={(ev) => setE({ name: ev.target.value })} aria-label="Name" />
                    <input value={e.url ?? x.url ?? ""} onChange={(ev) => setE({ url: ev.target.value })} aria-label="URL" />
                    <select value={e.folderId ?? x.folderId} onChange={(ev) => setE({ folderId: ev.target.value })} aria-label="Folder">
                      {!data.folders.some((f) => f.id === (e.folderId ?? x.folderId)) && <option value={x.folderId}>(deleted folder)</option>}
                      {data.folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                    </select>
                  </div>
                )}
                {x.kind === "editLink" && (
                  <div className="sugg-diff">
                    {link && x.name && x.name !== link.name && <div><del>{link.name}</del> → <ins>{x.name}</ins></div>}
                    {link && x.url && <div className="diff-url"><del>{link.url}</del> → <ins>{x.url}</ins></div>}
                  </div>
                )}
                {x.kind === "removeLink" && link && (
                  <div className="sugg-diff">Remove <strong>{link.name}</strong> from {folderName(x.folderId)}<div className="diff-url">{link.url}</div></div>
                )}
                {gone && <div className="sugg-warn">“{x.linkName}” no longer exists — decline or delete this one.</div>}
                {x.note && <div className="sugg-note">“{x.note}”</div>}
                <div className="sugg-actions">
                  {x.kind !== "other" ? (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy === x.id || gone}
                      onClick={async () => {
                        if (await act("approveSuggestion", x, { overrides: e })) showToast(`Approved — ${suggestionSummary(x)}`);
                      }}
                    >Approve &amp; apply</button>
                  ) : (
                    <button className="btn btn-primary btn-sm" disabled={busy === x.id} onClick={async () => { if (await act("approveSuggestion", x)) showToast("Marked as done"); }}>
                      Mark done
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busy === x.id}
                    onClick={async () => {
                      const reason = window.prompt("Reason for declining (optional — the user will see this):", "");
                      if (reason === null) return;
                      if (await act("rejectSuggestion", x, { reason })) showToast("Declined");
                    }}
                  >Decline</button>
                </div>
              </div>
            )}
            {x.status !== "pending" && (
              <button className="btn-icon sm sugg-del" title="Remove from list" onClick={() => act("deleteSuggestion", x)}><Icon name="x" /></button>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ---------- Polls ---------- */
function PollsTab({ data, run, submitting, showToast }: { data: BookmarksData; run: Api; submitting: boolean; showToast: (m: string) => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const polls = data.polls || [];
  const filled = options.map((o) => o.trim()).filter(Boolean);
  return (
    <>
      <form
        className="poll-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run("createPoll", { question, options: filled })) {
            setQuestion(""); setOptions(["", ""]); showToast("Poll posted for everyone");
          }
        }}
      >
        <div className="form-group">
          <label>Question</label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Which game should we add next?" maxLength={200} />
        </div>
        <label className="sub-label">Options</label>
        {options.map((o, i) => (
          <div key={i} className="poll-option-input">
            <input
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Option ${i + 1}`}
              maxLength={80}
            />
            {options.length > 2 && (
              <button type="button" className="btn-icon sm" onClick={() => setOptions(options.filter((_, j) => j !== i))} title="Remove option"><Icon name="x" /></button>
            )}
          </div>
        ))}
        <div className="admin-toolbar end">
          {options.length < 6 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOptions([...options, ""])}><Icon name="plus" /> Option</button>
          )}
          <button className="btn btn-primary btn-sm" disabled={submitting || !question.trim() || filled.length < 2}>Post poll</button>
        </div>
      </form>
      <h3 className="admin-h">All polls</h3>
      {polls.length === 0 && <div className="admin-empty">No polls yet.</div>}
      {polls.map((p) => {
        const total = Object.keys(p.votes).length;
        return (
          <div key={p.id} className={`sugg-card ${p.closed ? "approved" : "pending"}`}>
            <div className="sugg-top">
              <strong>{p.question}</strong>
              <span className="row-sub inline">{total} votes · {timeAgo(p.createdAt)}</span>
            </div>
            <div className="sugg-body">
              {p.options.map((o, i) => {
                const n = Object.values(p.votes).filter((v) => v === i).length;
                return (
                  <div key={i} className="bar-row">
                    <span className="bar-label">{o}</span>
                    <span className="bar"><span style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
                    <span className="bar-num">{n}</span>
                  </div>
                );
              })}
              <div className="sugg-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => run("closePoll", { pollId: p.id })}>{p.closed ? "Reopen" : "Close voting"}</button>
                <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm("Delete this poll?")) await run("deletePoll", { pollId: p.id }); }}>Delete</button>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Links ---------- */
type LinkFilter = "all" | "duplicates" | "unclicked" | "favorites" | string; // string = folder id
function LinksTab({
  data, rows, run, submitting, showToast,
}: { data: BookmarksData; rows: LinkRow[]; run: Api; submitting: boolean; showToast: (m: string) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<LinkFilter>("all");
  const [sort, setSort] = useState<"manual" | "clicks" | "newest" | "name">("manual");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ folderId: string; linkId: string; name: string; url: string; tags: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [bulkTag, setBulkTag] = useState("");

  const dupUrls = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(normUrl(r.link.url), (counts.get(normUrl(r.link.url)) || 0) + 1));
    return new Set(Array.from(counts).filter(([, n]) => n > 1).map(([u]) => u));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter(({ folder, link }) => {
      if (needle && !`${link.name} ${link.url} ${(link.tags || []).join(" ")}`.toLowerCase().includes(needle)) return false;
      if (filter === "duplicates") return dupUrls.has(normUrl(link.url));
      if (filter === "unclicked") return !link.clicks;
      if (filter === "favorites") return !!link.favorite;
      if (filter !== "all") return folder.id === filter;
      return true;
    });
    if (sort === "clicks") list = [...list].sort((a, b) => (b.link.clicks || 0) - (a.link.clicks || 0));
    if (sort === "newest") list = [...list].sort((a, b) => (b.link.createdAt || "").localeCompare(a.link.createdAt || ""));
    if (sort === "name") list = [...list].sort((a, b) => a.link.name.localeCompare(b.link.name));
    if (filter === "duplicates") list = [...list].sort((a, b) => normUrl(a.link.url).localeCompare(normUrl(b.link.url)));
    return list;
  }, [rows, q, filter, sort, dupUrls]);

  // drop selections for links that no longer exist (e.g. deleted by someone else)
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.link.id));
    setSelected((s) => {
      const next = new Set(Array.from(s).filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);

  const selectedRefs = rows.filter((r) => selected.has(r.link.id)).map((r) => ({ folderId: r.folder.id, linkId: r.link.id }));
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.link.id));
  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function saveEdit() {
    if (!editing) return;
    const ok = await run("editLink", {
      folderId: editing.folderId,
      linkId: editing.linkId,
      name: editing.name,
      url: editing.url,
      tags: editing.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (ok) { setEditing(null); showToast("Link saved"); }
  }

  const canReorder = sort === "manual" && filter !== "duplicates";

  return (
    <>
      <div className="admin-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search links…" />
      </div>
      <div className="admin-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All links ({rows.length})</option>
          <option value="duplicates">Duplicates ({rows.filter((r) => dupUrls.has(normUrl(r.link.url))).length})</option>
          <option value="unclicked">Never clicked</option>
          <option value="favorites">Starred</option>
          {data.folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="manual">Manual order</option>
          <option value="clicks">Most clicked</option>
          <option value="newest">Newest</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      <div className="bulk-bar">
        <label className="check">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected((s) => {
                const n = new Set(s);
                visible.forEach((r) => (allVisibleSelected ? n.delete(r.link.id) : n.add(r.link.id)));
                return n;
              })
            }
          />
          {selected.size ? `${selected.size} selected` : `${visible.length} shown`}
        </label>
        {selected.size > 0 && (
          <div className="bulk-actions">
            <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
              <option value="">Move to…</option>
              {data.folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
            </select>
            <button
              className="btn btn-secondary btn-sm"
              disabled={!moveTarget || submitting}
              onClick={async () => {
                if (await run("bulkMove", { items: selectedRefs, targetFolderId: moveTarget })) {
                  showToast(`Moved ${selectedRefs.length} links`); setSelected(new Set()); setMoveTarget("");
                }
              }}
            >Move</button>
            <input
              className="bulk-tag"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              placeholder="tag"
              aria-label="Tag to add or remove"
              maxLength={24}
            />
            <button
              className="btn btn-secondary btn-sm"
              disabled={!bulkTag.trim() || submitting}
              title="Add this tag to the selected links"
              onClick={async () => { if (await run("bulkTag", { items: selectedRefs, tag: bulkTag })) showToast(`Tagged ${selectedRefs.length} links #${bulkTag.trim().toLowerCase()}`); }}
            >+ Tag</button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={!bulkTag.trim() || submitting}
              title="Remove this tag from the selected links"
              onClick={async () => { if (await run("bulkTag", { items: selectedRefs, tag: bulkTag, remove: true })) showToast(`Removed #${bulkTag.trim().toLowerCase()}`); }}
            >− Tag</button>
            <button
              className="btn btn-danger btn-sm"
              disabled={submitting}
              onClick={async () => {
                if (!confirm(`Delete ${selectedRefs.length} links for everyone?`)) return;
                if (await run("bulkDelete", { items: selectedRefs })) {
                  showToast(`Deleted ${selectedRefs.length} links`); setSelected(new Set());
                }
              }}
            >Delete</button>
          </div>
        )}
      </div>
      <div className="admin-list">
        {visible.length === 0 && <div className="admin-empty">No links match.</div>}
        {visible.map(({ folder, link }) => {
          const isEditing = editing?.linkId === link.id;
          return (
            <div key={link.id} className={`admin-row ${selected.has(link.id) ? "sel" : ""}`}>
              {isEditing ? (
                <div className="row-edit">
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Name" autoFocus />
                  <input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="URL" />
                  <input value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} placeholder="Tags, comma separated" />
                  <div className="row-edit-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" disabled={submitting} onClick={saveEdit}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <input type="checkbox" checked={selected.has(link.id)} onChange={() => toggle(link.id)} aria-label={`Select ${link.name}`} />
                  <Favicon url={link.url} name={link.name} size={16} />
                  <div className="row-main">
                    <div className="row-title">
                      {link.favorite && "⭐ "}{link.name}
                      {dupUrls.has(normUrl(link.url)) && <span className="pill warn">dup</span>}
                    </div>
                    <div className="row-sub">{folder.emoji} {folder.name} · {link.url.replace(/^https?:\/\//, "")}</div>
                  </div>
                  <span className="row-num" title="Clicks">{link.clicks || 0}</span>
                  <div className="row-actions">
                    {canReorder && (
                      <>
                        <button className="btn-icon sm" title="Move up" onClick={() => run("reorderLink", { folderId: folder.id, linkId: link.id, dir: -1 })}><Icon name="up" /></button>
                        <button className="btn-icon sm" title="Move down" onClick={() => run("reorderLink", { folderId: folder.id, linkId: link.id, dir: 1 })}><Icon name="down" /></button>
                      </>
                    )}
                    <button className="btn-icon sm" title="Edit" onClick={() => setEditing({ folderId: folder.id, linkId: link.id, name: link.name, url: link.url, tags: (link.tags || []).join(", ") })}><Icon name="edit" /></button>
                    <button className="btn-icon sm" title="Reset clicks" onClick={() => run("resetClicks", { folderId: folder.id, linkId: link.id })}><Icon name="reset" /></button>
                    <button
                      className="btn-icon sm danger"
                      title="Delete"
                      onClick={async () => {
                        if (confirm(`Delete “${link.name}”?`) && (await run("deleteLink", { folderId: folder.id, linkId: link.id }))) showToast("Deleted");
                      }}
                    ><Icon name="trash" /></button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Folders ---------- */
function FoldersTab({
  data, run, submitting, showToast,
}: { data: BookmarksData; run: Api; submitting: boolean; showToast: (m: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; emoji: string; color: string }>>({});
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📁");

  const draftFor = (f: Folder) => drafts[f.id] || { name: f.name, emoji: f.emoji, color: f.color || "#7c6cff" };
  const setDraft = (f: Folder, patch: Partial<{ name: string; emoji: string; color: string }>) =>
    setDrafts((d) => ({ ...d, [f.id]: { ...draftFor(f), ...patch } }));
  const isDirty = (f: Folder) => {
    const d = drafts[f.id];
    return !!d && (d.name !== f.name || d.emoji !== f.emoji || d.color !== (f.color || "#7c6cff"));
  };

  return (
    <>
      <form
        className="admin-toolbar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          if (await run("addFolder", { name: newName, emoji: newEmoji || "📁" })) {
            setNewName(""); showToast("Folder created");
          }
        }}
      >
        <input className="emoji-input" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New folder name" />
        <button className="btn btn-primary btn-sm" disabled={submitting || !newName.trim()}>Add</button>
      </form>
      <div className="admin-list">
        {data.folders.map((f, i) => {
          const d = draftFor(f);
          return (
            <div key={f.id} className="admin-row folder-row">
              <div className="reorder">
                <button className="btn-icon sm" disabled={i === 0} title="Move up" onClick={() => run("reorderFolder", { folderId: f.id, dir: -1 })}><Icon name="up" /></button>
                <button className="btn-icon sm" disabled={i === data.folders.length - 1} title="Move down" onClick={() => run("reorderFolder", { folderId: f.id, dir: 1 })}><Icon name="down" /></button>
              </div>
              <input className="emoji-input" value={d.emoji} onChange={(e) => setDraft(f, { emoji: e.target.value })} maxLength={4} aria-label="Emoji" />
              <input className="folder-name" value={d.name} onChange={(e) => setDraft(f, { name: e.target.value })} aria-label="Folder name" />
              <input type="color" className="color-input" value={d.color} onChange={(e) => setDraft(f, { color: e.target.value })} aria-label="Color" />
              <span className="row-num" title="Links">{f.links.length}</span>
              <div className="row-actions">
                {isDirty(f) && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={submitting}
                    onClick={async () => {
                      if (await run("editFolder", { folderId: f.id, ...d })) {
                        setDrafts((all) => { const n = { ...all }; delete n[f.id]; return n; });
                        showToast("Folder saved");
                      }
                    }}
                  >Save</button>
                )}
                <button className={`btn-icon sm ${f.pinned ? "on" : ""}`} title={f.pinned ? "Unpin" : "Pin to top"} onClick={() => run("editFolder", { folderId: f.id, pinned: !f.pinned })}><Icon name="pin" /></button>
                <button
                  className="btn-icon sm danger"
                  title="Delete folder"
                  onClick={async () => {
                    if (confirm(`Delete “${f.name}” and its ${f.links.length} links?`) && (await run("deleteFolder", { folderId: f.id }))) showToast("Folder deleted");
                  }}
                ><Icon name="trash" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Chat moderation ---------- */
function ChatTab({
  data, password, run, admin, info, refreshInfo, showToast,
}: {
  data: BookmarksData; password: string; run: Api; admin: (a: string, p?: Record<string, any>) => Promise<any>;
  info: AdminInfo | null; refreshInfo: () => void; showToast: (m: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/chat", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json.messages)) setMessages(json.messages);
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 3000);
    return () => clearInterval(id);
  }, [load]);

  const banned = new Set(info?.banned || []);
  const chatOn = data.settings?.chatEnabled !== false;
  const shown = messages.filter((m) => !q || `${m.user} ${m.text}`.toLowerCase().includes(q.toLowerCase())).reverse();

  async function del(id: string) {
    const res = await fetch("/api/chat", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    if (!res.ok) showToast((await res.json().catch(() => ({}))).error || "Could not delete");
    load();
    refreshInfo();
  }

  return (
    <>
      <Toggle
        label="Chat enabled"
        hint="When off, nobody can send messages."
        checked={chatOn}
        onChange={(v) => run("setSettings", { settings: { chatEnabled: v } })}
      />
      <div className="admin-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search messages or users…" />
        <button
          className="btn btn-danger btn-sm"
          onClick={async () => {
            if (!confirm("Delete ALL chat messages for everyone?")) return;
            try { await admin("clearChat"); setMessages([]); refreshInfo(); showToast("Chat cleared"); }
            catch (e: any) { showToast(e.message); }
          }}
        >Clear chat</button>
      </div>
      <div className="admin-list">
        {shown.length === 0 && <div className="admin-empty">No messages.</div>}
        {shown.map((m) => {
          const isBanned = banned.has(m.user.toLowerCase());
          return (
            <div key={m.id} className="admin-row msg-row">
              <div className="row-main">
                <div className="row-title">
                  {m.user}
                  {isBanned && <span className="pill bad">muted</span>}
                  <span className="row-sub inline">{timeAgo(m.at)}</span>
                </div>
                <div className="msg-text">{m.text}</div>
              </div>
              <div className="row-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    try { await admin(isBanned ? "unban" : "ban", { username: m.user }); refreshInfo(); showToast(isBanned ? `Unmuted ${m.user}` : `Muted ${m.user}`); }
                    catch (e: any) { showToast(e.message); }
                  }}
                >{isBanned ? "Unmute" : "Mute"}</button>
                <button className="btn-icon sm danger" title="Delete message" onClick={() => del(m.id)}><Icon name="trash" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Users ---------- */
function UsersTab({
  admin, info, refreshInfo, showToast,
}: { admin: (a: string, p?: Record<string, any>) => Promise<any>; info: AdminInfo | null; refreshInfo: () => void; showToast: (m: string) => void }) {
  const [q, setQ] = useState("");
  if (!info) return <div className="admin-empty">Loading users…</div>;
  const banned = new Set(info.banned);
  const users = info.users.filter((u) => u.username.toLowerCase().includes(q.toLowerCase()));
  const act = async (action: string, username: string, done: string) => {
    try { await admin(action, { username }); refreshInfo(); showToast(done); }
    catch (e: any) { showToast(e.message); }
  };
  return (
    <>
      <div className="admin-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${info.users.length} users…`} />
      </div>
      <div className="admin-list">
        {users.length === 0 && <div className="admin-empty">No users yet.</div>}
        {users.map((u) => {
          const isBanned = banned.has(u.username.toLowerCase());
          return (
            <div key={u.username} className="admin-row">
              <span className="avatar">{u.username[0]?.toUpperCase()}</span>
              <div className="row-main">
                <div className="row-title">{u.username}{isBanned && <span className="pill bad">muted</span>}</div>
                <div className="row-sub">joined {timeAgo(u.createdAt)}</div>
              </div>
              <div className="row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => act(isBanned ? "unban" : "ban", u.username, isBanned ? `Unmuted ${u.username}` : `Muted ${u.username}`)}>
                  {isBanned ? "Unmute" : "Mute"}
                </button>
                <button
                  className="btn-icon sm danger"
                  title="Delete account"
                  onClick={() => { if (confirm(`Delete ${u.username}'s account? They'll be logged out.`)) act("deleteUser", u.username, `Deleted ${u.username}`); }}
                ><Icon name="trash" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Site settings ---------- */
function SiteTab({
  data, run, submitting, showToast,
}: { data: BookmarksData; run: Api; submitting: boolean; showToast: (m: string) => void }) {
  const s = data.settings || {};
  const [title, setTitle] = useState(s.title || "");
  const [subtitle, setSubtitle] = useState(s.subtitle || "");
  const [announcement, setAnnouncement] = useState(s.announcement || "");
  const dirty = title !== (s.title || "") || subtitle !== (s.subtitle || "") || announcement !== (s.announcement || "");
  return (
    <>
      <div className="form-group">
        <label>Site title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Made by Theo 7A" />
      </div>
      <div className="form-group">
        <label>Subtitle</label>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Shared school bookmarks — everyone sees the same list" />
      </div>
      <div className="form-group">
        <label>Announcement banner</label>
        <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Shown at the top for everyone. Leave empty to hide." />
      </div>
      <div className="admin-toolbar end">
        {dirty && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setTitle(s.title || ""); setSubtitle(s.subtitle || ""); setAnnouncement(s.announcement || ""); }}>Revert</button>
        )}
        <button
          className="btn btn-primary btn-sm"
          disabled={!dirty || submitting}
          onClick={async () => { if (await run("setSettings", { settings: { title, subtitle, announcement } })) showToast("Site updated for everyone"); }}
        >Save changes</button>
      </div>
      <h3 className="admin-h">Permissions</h3>
      <Toggle
        label="Lock adding"
        hint="Only admins can add websites and folders."
        checked={!!s.lockAdding}
        onChange={(v) => run("setSettings", { settings: { lockAdding: v } })}
      />
      <Toggle
        label="Chat enabled"
        hint="Let logged-in users send messages."
        checked={s.chatEnabled !== false}
        onChange={(v) => run("setSettings", { settings: { chatEnabled: v } })}
      />
    </>
  );
}

/* ---------- Data ---------- */
function DataTab({ data, run, showToast }: { data: BookmarksData; run: Api; showToast: (m: string) => void }) {
  const stamp = new Date().toISOString().slice(0, 10);
  function download(content: string, type: string, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
  }
  function exportHtml() {
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`;
    for (const f of data.folders) {
      html += `  <DT><H3>${esc(`${f.emoji} ${f.name}`)}</H3>\n  <DL><p>\n`;
      for (const l of f.links) html += `    <DT><A HREF="${esc(l.url)}">${esc(l.name)}</A>\n`;
      html += `  </DL><p>\n`;
    }
    download(html + `</DL><p>\n`, "text/html", `bookmarks-${stamp}.html`);
  }
  async function importFile(file: File) {
    try {
      const payload = JSON.parse(await file.text());
      if (!Array.isArray(payload.folders)) throw new Error();
      if (!confirm(`Replace everything with ${payload.folders.length} folders from ${file.name}?`)) return;
      if (await run("importData", { payload })) showToast("Imported!");
    } catch {
      showToast("That isn't a valid bookmarks JSON file");
    }
  }
  const danger = async (msg: string, action: string, done: string) => {
    if (confirm(msg) && (await run(action))) showToast(done);
  };
  return (
    <>
      <h3 className="admin-h">Backup</h3>
      <div className="action-grid">
        <button className="action-card" onClick={() => { download(JSON.stringify(data, null, 2), "application/json", `bookmarks-${stamp}.json`); showToast("Exported JSON"); }}>
          <Icon name="download" /><span>Export JSON</span><em>Full backup</em>
        </button>
        <button className="action-card" onClick={() => { exportHtml(); showToast("Exported HTML"); }}>
          <Icon name="download" /><span>Export HTML</span><em>Import into Chrome</em>
        </button>
        <label className="action-card">
          <Icon name="upload" /><span>Import JSON</span><em>Replaces everything</em>
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        </label>
        <label className="action-card">
          <Icon name="upload" /><span>Import from browser</span><em>Chrome/Edge bookmarks .html — adds folders</em>
          <input
            type="file"
            accept=".html,.htm,text/html"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const folders = parseBookmarksHtml(await f.text());
              const count = folders.reduce((n, x) => n + x.links.length, 0);
              if (!count) { showToast("No web links found in that file"); return; }
              if (!confirm(`Add ${count} websites in ${folders.length} new folder(s)? Existing bookmarks stay as they are.`)) return;
              if (await run("addFolders", { folders })) showToast(`Imported ${count} websites`);
            }}
          />
        </label>
        <button className="action-card" onClick={async () => { if (await run("undo")) showToast("Undone — press again to redo"); }}>
          <Icon name="undo" /><span>Undo last change</span><em>Press again to redo</em>
        </button>
      </div>
      <h3 className="admin-h">Danger zone</h3>
      <div className="danger-zone">
        <div className="danger-row">
          <div><strong>Reset click counts</strong><span>Sets every link back to 0 clicks.</span></div>
          <button className="btn btn-danger btn-sm" onClick={() => danger("Reset ALL click counts to 0?", "resetClicks", "Clicks reset")}>Reset</button>
        </div>
        <div className="danger-row">
          <div><strong>Restore default bookmarks</strong><span>Replaces everything with the starter set.</span></div>
          <button className="btn btn-danger btn-sm" onClick={() => danger("Replace everything with the default bookmarks?", "reset", "Reset to defaults")}>Restore</button>
        </div>
        <div className="danger-row">
          <div><strong>Delete everything</strong><span>Removes all folders and links.</span></div>
          <button className="btn btn-danger btn-sm" onClick={() => danger("Delete ALL folders and links? Use Undo right after if you change your mind.", "clearAll", "Everything cleared")}>Delete all</button>
        </div>
      </div>
    </>
  );
}

/* ---------- Activity ---------- */
function ActivityTab({ data, audit }: { data: BookmarksData; audit?: AuditEntry[] }) {
  const [view, setView] = useState<"activity" | "audit">("activity");
  if (audit && audit.length > 0) {
    return (
      <>
        <div className="seg">
          <button className={view === "activity" ? "on" : ""} onClick={() => setView("activity")}>Everyone</button>
          <button className={view === "audit" ? "on" : ""} onClick={() => setView("audit")}>Admin log <span>{audit.length}</span></button>
        </div>
        {view === "audit" ? <AuditList items={audit} /> : <ActivityInner data={data} />}
      </>
    );
  }
  return <ActivityInner data={data} />;
}
function AuditList({ items }: { items: AuditEntry[] }) {
  return (
    <div className="admin-list">
      {items.map((a, i) => (
        <div key={i} className="admin-row">
          <span className="avatar sm">{(a.actor[0] || "?").toUpperCase()}</span>
          <div className="row-main">
            <div className="row-title">{a.actor} <span className={`pill role-${a.role}`}>{a.role}</span></div>
            <div className="row-sub">{a.action}{a.detail ? ` · ${a.detail}` : ""}</div>
          </div>
          <span className="row-sub">{timeAgo(a.at)}</span>
        </div>
      ))}
    </div>
  );
}
function ActivityInner({ data }: { data: BookmarksData }) {
  const [type, setType] = useState("all");
  const items = data.activity || [];
  const types = Array.from(new Set(items.map((a) => a.action)));
  return (
    <>
      <div className="admin-toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All activity ({items.length})</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <ActivityList items={items.filter((a) => type === "all" || a.action === type)} />
    </>
  );
}

function ActivityList({ items }: { items: NonNullable<BookmarksData["activity"]> }) {
  if (!items.length) return <div className="admin-empty">No activity yet.</div>;
  return (
    <div className="timeline">
      {items.map((a) => (
        <div key={a.id} className="timeline-item">
          <span className={`tl-dot ${a.action}`} />
          <span className="tl-text">{a.detail}</span>
          <span className="tl-time">{timeAgo(a.at)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- shared bits ---------- */
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <div>
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
