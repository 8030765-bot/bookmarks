"use client";
import { useEffect, useMemo, useState } from "react";
import { BookmarksData, Folder, Link } from "@/lib/types";
import { Icon } from "./components/Icon";

/* Shared shapes from /api/admin overview (only the parts these screens use). */
export interface Extras {
  users: { username: string; createdAt: string }[];
  banned: string[];
  roles: Record<string, string | null>;
  lastSeen?: Record<string, number>;
  timeouts?: Record<string, { until: string; reason?: string; by: string }>;
  frozen?: string[];
  contributors?: string[];
  beta?: string[];
  names?: Record<string, string[]>;
  noteCounts?: Record<string, number>;
  reports?: { id: string; kind: string; targetId: string; targetName: string; reason: string; by: string; at: string; extra?: string }[];
  board?: { id: string; kind: "note" | "todo"; text: string; by: string; at: string; pinned?: boolean; done?: boolean }[];
  stats?: { day: string; signups: number; clicks: number; messages: number; links: number; posts: number }[];
  invites?: { code: string; by: string; at: string; uses: number; maxUses: number; expiresAt?: string }[];
  trash?: { id: string; kind: "link" | "folder"; at: string; by?: string; folderName?: string; item: { name?: string; url?: string; links?: unknown[] } }[];
  errors?: { at: string; message: string; where?: string }[];
  linkNotes?: Record<string, string>;
  db?: { keys: number; blobBytes: number; approxBytes: number; limitBytes: number };
  modPermList?: { id: string; label: string }[];
  audit?: { at: string; actor: string; role: string; action: string; detail?: string }[];
  me?: { user: string | null; role: string | null };
  feedback?: { id: string; kind: "bug" | "contact"; text: string; user?: string; page?: string; device?: string; at: string; reply?: { by: string; text: string; at: string } }[];
  pageRatings?: Record<string, { good: number; ok: number; bad: number }>;
  pictures?: { id: string; owner: string; kind: string; type: string; bytes: number; at: string }[];
}
type AdminFn = (a: string, p?: Record<string, any>) => Promise<any>;
type Run = (action: string, payload?: Record<string, any>) => Promise<boolean>;
type Toast = (m: string) => void;

export function ago(iso?: string | number | null) {
  if (!iso) return "never";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function download(name: string, content: string, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/* ---------- "type the word to confirm" ---------- */
export function DangerButton({ label, word, warning, onConfirm, small = true }: { label: string; word: string; warning: string; onConfirm: (typed: string) => void; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <>
      <button className={`btn btn-danger ${small ? "btn-sm" : ""}`} onClick={() => { setTyped(""); setOpen(true); }}>{label}</button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal danger-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={label}>
            <h2>⚠️ {label}</h2>
            <p className="modal-text">{warning}</p>
            <label className="hint">Type <strong>{word}</strong> to confirm</label>
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && typed.trim().toUpperCase() === word) { setOpen(false); onConfirm(word); } }} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={typed.trim().toUpperCase() !== word} onClick={() => { setOpen(false); onConfirm(word); }}>{label}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- dashboard: charts, database meter, staff board ---------- */
function Bars({ rows, field, label, color }: { rows: NonNullable<Extras["stats"]>; field: "signups" | "clicks" | "messages" | "links" | "posts"; label: string; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r[field]));
  const total = rows.reduce((n, r) => n + r[field], 0);
  return (
    <div className="chart">
      <div className="chart-head"><strong>{label}</strong><span className="muted-inline">{total} in 2 weeks</span></div>
      <svg viewBox={`0 0 ${rows.length * 12} 60`} preserveAspectRatio="none" className="chart-svg" role="img" aria-label={`${label} per day: ${rows.map((r) => r[field]).join(", ")}`}>
        {rows.map((r, i) => {
          const h = (r[field] / max) * 54;
          return <rect key={r.day} x={i * 12 + 2} y={58 - h} width={8} height={Math.max(h, r[field] ? 2 : 0.5)} rx={2} fill={color}><title>{`${r.day}: ${r[field]}`}</title></rect>;
        })}
      </svg>
      <div className="chart-foot"><span>{rows[0]?.day.slice(5)}</span><span>today</span></div>
    </div>
  );
}
export function Dashboard({ info, admin, refresh, toast, isAdmin }: { info: Extras | null; admin: AdminFn; refresh: () => void; toast: Toast; isAdmin: boolean }) {
  if (!info) return null;
  const stats = info.stats || [];
  return (
    <>
      {stats.length > 0 && (
        <div className="charts">
          <Bars rows={stats} field="clicks" label="Visits" color="var(--accent)" />
          <Bars rows={stats} field="signups" label="New accounts" color="var(--success)" />
          <Bars rows={stats} field="messages" label="Chat messages" color="#4dabff" />
          <Bars rows={stats} field="links" label="Links added" color="var(--warning)" />
        </div>
      )}
      {isAdmin && info.db && (
        <div className="db-meter" title="A rough estimate — the database company's own dashboard has the exact number">
          <div className="chart-head"><strong>Database</strong><span className="muted-inline">≈ {kb(info.db.approxBytes)} of {kb(info.db.limitBytes)} · {info.db.keys} keys · bookmarks {kb(info.db.blobBytes)}</span></div>
          <span className="goal-bar wide"><span style={{ width: `${Math.min(100, Math.max(1, (info.db.approxBytes / info.db.limitBytes) * 100))}%` }} /></span>
        </div>
      )}
      <StaffBoard items={info.board || []} admin={admin} refresh={refresh} toast={toast} />
    </>
  );
}

/** Pinned notes, the admin to-do list and the mods' shared notes — one board. */
function StaffBoard({ items, admin, refresh, toast }: { items: NonNullable<Extras["board"]>; admin: AdminFn; refresh: () => void; toast: Toast }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"note" | "todo">("note");
  const save = async (p: Record<string, unknown>) => { try { await admin("boardSave", p); refresh(); } catch (e: any) { toast(e.message); } };
  return (
    <section className="staff-board">
      <h3 className="admin-h">Staff board</h3>
      <form className="status-row" onSubmit={async (e) => { e.preventDefault(); if (text.trim()) { await save({ text, kind }); setText(""); } }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as "note" | "todo")} aria-label="Kind" className="sb-kind">
          <option value="note">Note</option>
          <option value="todo">To-do</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Shared with all admins and mods…" maxLength={500} />
        <button className="btn btn-primary btn-sm" disabled={!text.trim()}>Add</button>
      </form>
      {items.length === 0 && <div className="admin-empty">Nothing on the board.</div>}
      {items.map((b) => (
        <div key={b.id} className={`sb-item ${b.pinned ? "pinned" : ""} ${b.done ? "done" : ""}`}>
          {b.kind === "todo" ? <input type="checkbox" checked={!!b.done} onChange={() => save({ id: b.id, done: !b.done })} aria-label="Done" /> : <span aria-hidden="true">📝</span>}
          <div className="row-main"><div className="sb-text">{b.text}</div><div className="row-sub">{b.by} · {ago(b.at)}</div></div>
          <button className={`btn-icon sm ${b.pinned ? "on" : ""}`} title={b.pinned ? "Unpin" : "Pin to the top"} onClick={() => save({ id: b.id, pinned: !b.pinned })}><Icon name="pin" /></button>
          <button className="btn-icon sm danger" title="Remove" onClick={async () => { try { await admin("boardDelete", { id: b.id }); refresh(); } catch (e: any) { toast(e.message); } }}><Icon name="x" /></button>
        </div>
      ))}
    </section>
  );
}

/* ---------- people & moderation ---------- */
type Filter = "all" | "muted" | "timeout" | "frozen" | "staff" | "contributors" | "beta" | "new";
export function PeopleTab({ info, admin, refresh, toast, isAdmin }: { info: Extras | null; admin: AdminFn; refresh: () => void; toast: Toast; isAdmin: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"seen" | "joined" | "name">("seen");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [inactive, setInactive] = useState<{ username: string; createdAt: string; lastSeen: number | null }[] | null>(null);
  const [days, setDays] = useState(90);
  if (!info) return <div className="admin-empty">Loading people…</div>;
  const banned = new Set(info.banned);
  const timeouts = info.timeouts || {};
  const frozen = new Set(info.frozen || []);
  const contributors = new Set(info.contributors || []);
  const beta = new Set(info.beta || []);
  const seen = info.lastSeen || {};
  const k = (u: string) => u.toLowerCase();
  const list = info.users
    .filter((u) => u.username.toLowerCase().includes(q.trim().toLowerCase()) || (info.names?.[k(u.username)] || []).some((n) => n.toLowerCase().includes(q.trim().toLowerCase())))
    .filter((u) => {
      const n = k(u.username);
      return filter === "all" || (filter === "muted" && banned.has(n)) || (filter === "timeout" && !!timeouts[n]) || (filter === "frozen" && frozen.has(n))
        || (filter === "staff" && !!info.roles[n]) || (filter === "contributors" && contributors.has(n)) || (filter === "beta" && beta.has(n))
        || (filter === "new" && Date.now() - Date.parse(u.createdAt) < 7 * 86400_000);
    })
    .sort((a, b) => sort === "name" ? a.username.localeCompare(b.username) : sort === "joined" ? b.createdAt.localeCompare(a.createdAt) : (seen[k(b.username)] || 0) - (seen[k(a.username)] || 0));
  const toggle = (u: string) => setPicked((p) => { const n = new Set(p); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  const bulk = async (op: string, extra: Record<string, unknown> = {}) => {
    try {
      const j = await admin("bulkUsers", { usernames: Array.from(picked), op, ...extra });
      toast(`Done for ${j.done}${j.skipped ? ` (skipped ${j.skipped} staff)` : ""}`);
      setPicked(new Set());
      refresh();
    } catch (e: any) { toast(e.message); }
  };
  return (
    <>
      <div className="admin-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${info.users.length} people (old names too)…`} />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="seen">Last seen</option>
          <option value="joined">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div className="chip-grid people-filters">
        {(["all", "new", "muted", "timeout", "frozen", "staff", "contributors", "beta"] as Filter[]).map((f) => (
          <button key={f} className={`pick ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{f === "timeout" ? "timed out" : f === "new" ? "joined this week" : f}</button>
        ))}
      </div>
      {picked.size > 0 && (
        <div className="bulk-bar">
          <strong>{picked.size} picked</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => bulk("mute")}>Mute</button>
          <button className="btn btn-secondary btn-sm" onClick={() => bulk("unmute")}>Unmute</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { const h = prompt("Time out for how many hours?", "24"); if (h) bulk("timeout", { hours: Number(h) }); }}>Time out</button>
          <button className="btn btn-secondary btn-sm" onClick={() => bulk("freeze")}>Freeze edits</button>
          <button className="btn btn-secondary btn-sm" onClick={() => bulk("logout")}>Log out</button>
          {isAdmin && <DangerButton label="Delete accounts" word="DELETE" warning={`Delete ${picked.size} account(s) and everything kept about them? This can't be undone.`} onConfirm={(w) => bulk("delete", { confirm: w })} />}
          <button className="link-btn" onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}
      <div className="admin-list">
        {list.length === 0 && <div className="admin-empty">No one matches.</div>}
        {list.map((u) => {
          const n = k(u.username);
          const t = timeouts[n];
          const role = info.roles[n];
          const ageDays = Math.floor((Date.now() - Date.parse(u.createdAt)) / 86400_000);
          return (
            <div key={u.username} className={`admin-row ${open === u.username ? "open" : ""}`}>
              <input type="checkbox" checked={picked.has(u.username)} onChange={() => toggle(u.username)} aria-label={`Pick ${u.username}`} disabled={!!role} />
              <button className="row-main row-btn" onClick={() => setOpen(open === u.username ? null : u.username)}>
                <div className="row-title">
                  {u.username}
                  <CopyName name={u.username} toast={toast} />
                  {role && <span className={`pill role-${role}`}>{role}</span>}
                  {banned.has(n) && <span className="pill bad">muted</span>}
                  {t && <span className="pill warn" title={t.reason}>timed out</span>}
                  {frozen.has(n) && <span className="pill warn">frozen</span>}
                  {contributors.has(n) && <span className="pill">contributor</span>}
                  {beta.has(n) && <span className="pill">beta</span>}
                  {(info.noteCounts?.[n] || 0) > 0 && <span className="pill" title="Mod notes">📝 {info.noteCounts![n]}</span>}
                </div>
                <div className="row-sub">
                  seen {ago(seen[n] || null)} · account {ageDays < 1 ? "less than a day" : `${ageDays} day${ageDays === 1 ? "" : "s"}`} old
                  {ageDays < 1 && <span className="pill warn">new</span>}
                  {info.names?.[n]?.length ? ` · was ${info.names[n].join(", ")}` : ""}
                </div>
              </button>
            </div>
          );
        })}
      </div>
      {open && <UserDrawer username={open} info={info} admin={admin} refresh={refresh} toast={toast} isAdmin={isAdmin} onClose={() => setOpen(null)} />}
      {isAdmin && (
        <section>
          <h3 className="admin-h">Inactive accounts</h3>
          <div className="status-row">
            <span className="row-sub">Not seen for</span>
            <input type="number" min={7} max={730} value={days} onChange={(e) => setDays(Number(e.target.value))} className="num-in" aria-label="Days" />
            <span className="row-sub">days and never added a link</span>
            <button className="btn btn-secondary btn-sm" onClick={async () => { try { setInactive((await admin("inactive", { days })).inactive); } catch (e: any) { toast(e.message); } }}>Find</button>
          </div>
          {inactive && (inactive.length === 0 ? <div className="admin-empty">No inactive accounts.</div> : (
            <>
              <p className="row-sub">{inactive.map((u) => u.username).join(", ")}</p>
              <DangerButton label={`Remove ${inactive.length} accounts`} word="DELETE" warning="These accounts and everything kept about them will be deleted. This can't be undone."
                onConfirm={async (w) => {
                  try { const j = await admin("bulkUsers", { usernames: inactive.map((u) => u.username), op: "delete", confirm: w }); toast(`Removed ${j.done} accounts`); setInactive(null); refresh(); }
                  catch (e: any) { toast(e.message); }
                }} />
            </>
          ))}
        </section>
      )}
    </>
  );
}

function UserDrawer({ username, info, admin, refresh, toast, isAdmin, onClose }: {
  username: string; info: Extras; admin: AdminFn; refresh: () => void; toast: Toast; isAdmin: boolean; onClose: () => void;
}) {
  const [d, setD] = useState<{ history: { at: string; action: string; by: string; reason?: string; until?: string }[]; notes: { id: string; by: string; at: string; text: string }[]; previousNames: string[]; role: string | null; contributor: boolean; beta: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const load = () => admin("userDetail", { username }).then(setD).catch((e: any) => toast(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [username]);
  const n = username.toLowerCase();
  const muted = info.banned.includes(n);
  const timeout = info.timeouts?.[n];
  const frozen = info.frozen?.includes(n);
  const act = async (action: string, extra: Record<string, unknown> = {}, done?: string) => {
    try { await admin(action, { username, ...extra }); if (done) toast(done); refresh(); load(); }
    catch (e: any) { toast(e.message); }
  };
  return (
    <div className="user-drawer" role="region" aria-label={`Moderate ${username}`}>
      <div className="ud-head">
        <strong>{username}</strong>
        <a className="link-btn" href={`/u/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer">profile</a>
        <button className="btn-icon sm" onClick={onClose} aria-label="Close" title="Close"><Icon name="x" /></button>
      </div>
      {d?.previousNames.length ? <p className="row-sub">Earlier names: {d.previousNames.join(", ")}</p> : null}
      <div className="form-group">
        <label>Reason (shown to them for warnings and timeouts)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. spamming links in chat" />
      </div>
      <div className="ud-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => act("warn", { reason }, "Warning sent")} disabled={!reason.trim()}>⚠️ Warn</button>
        <span className="status-row inline">
          <input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="num-in" aria-label="Hours" />
          <button className="btn btn-secondary btn-sm" onClick={() => act("timeout", { hours, reason }, `Timed out for ${hours}h`)}>⏳ Time out</button>
        </span>
        {timeout && <button className="btn btn-secondary btn-sm" onClick={() => act("endTimeout", {}, "Timeout ended")}>End timeout ({ago(timeout.until).replace(" ago", "")} left)</button>}
        <button className="btn btn-secondary btn-sm" onClick={() => act(muted ? "unban" : "ban", { reason }, muted ? "Unmuted" : "Muted")}>{muted ? "🔊 Unmute" : "🔇 Mute"}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => act(frozen ? "unfreeze" : "freeze", {}, frozen ? "Edits unfrozen" : "Edits frozen")}>{frozen ? "Unfreeze edits" : "🧊 Freeze edits"}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => act("forceLogout", {}, "Logged out everywhere")}>Log out everywhere</button>
        {isAdmin && d && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => act("setGroup", { group: "contributors", on: !d.contributor }, d.contributor ? "No longer a contributor" : "Now a contributor")}>{d.contributor ? "Remove contributor" : "Make contributor"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => act("setGroup", { group: "beta", on: !d.beta }, d.beta ? "Left the beta group" : "Added to beta testers")}>{d.beta ? "Remove from beta" : "Add to beta testers"}</button>
            <button className="btn btn-secondary btn-sm" onClick={async () => {
              if (!confirm(`Reset ${username}'s password? You'll get a temporary password to give them.`)) return;
              try { const j = await admin("resetPassword", { username }); window.prompt(`Temporary password for ${username} — copy and give it to them:`, j.tempPassword); } catch (e: any) { toast(e.message); }
            }}>Reset password</button>
            <DangerButton label="Delete account" word="DELETE" warning={`Delete ${username} and everything kept about them? This can't be undone.`} onConfirm={() => act("deleteUser", { purge: true }, `Deleted ${username}`).then(onClose)} />
          </>
        )}
      </div>
      <h4 className="admin-h">Private mod notes</h4>
      <form className="status-row" onSubmit={async (e) => { e.preventDefault(); if (note.trim()) { await act("modNote", { text: note }); setNote(""); } }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only staff can see these" maxLength={500} />
        <button className="btn btn-secondary btn-sm" disabled={!note.trim()}>Add</button>
      </form>
      {d?.notes.map((x) => (
        <div key={x.id} className="admin-row compact"><div className="row-main"><div>{x.text}</div><div className="row-sub">{x.by} · {ago(x.at)}</div></div>
          <button className="btn-icon sm" title="Delete note" onClick={() => act("modNote", { remove: true, id: x.id })}><Icon name="x" /></button></div>
      ))}
      <h4 className="admin-h">History</h4>
      {!d && <div className="skeleton skel-line" />}
      {d && d.history.length === 0 && <div className="admin-empty">Nothing on record.</div>}
      {d?.history.map((h, i) => <div key={i} className="row-sub">{ago(h.at)} · <strong>{h.action}</strong> by {h.by}{h.reason ? ` — “${h.reason}”` : ""}</div>)}
    </div>
  );
}

/* ---------- reports + trash ---------- */
export function ReportsTab({ info, admin, run, data, refresh, toast, isAdmin }: { info: Extras | null; admin: AdminFn; run: Run; data: BookmarksData; refresh: () => void; toast: Toast; isAdmin: boolean }) {
  if (!info) return <div className="admin-empty">Loading…</div>;
  const reports = info.reports || [];
  const findLink = (id: string) => { for (const f of data.folders) { const l = f.links.find((x) => x.id === id); if (l) return { f, l }; } return null; };
  const resolve = async (id: string, outcome = "dismissed") => { try { await admin("resolveReport", { id, outcome }); refresh(); } catch (e: any) { toast(e.message); } };
  return (
    <>
      <PicturesQueue info={info} admin={admin} refresh={refresh} toast={toast} />
      <h3 className="admin-h">Reports {reports.length > 0 && `(${reports.length})`}</h3>
      {reports.length === 0 && <div className="admin-empty">No reports. 🎉</div>}
      {reports.map((r) => {
        const link = r.kind === "link" ? findLink(r.targetId) : null;
        return (
          <div key={r.id} className="sugg-card pending">
            <div className="sugg-top"><span className="pill">{r.kind}</span><strong>{r.targetName || r.targetId}</strong><span className="row-sub inline">by {r.by} · {ago(r.at)}</span></div>
            <div className="sugg-body">
              <div className="sugg-note">“{r.reason}”</div>
              {r.extra && <div className="row-sub">{r.extra}</div>}
              {link && <div className="row-sub">{link.f.emoji} {link.f.name} · {link.l.url}</div>}
              {r.kind === "picture" && r.extra && /^[a-f0-9]{32}$/.test(r.extra) && <img className="queue-pic" src={`/api/img/${r.extra}`} alt={`${r.targetId}'s picture`} />}
              <div className="sugg-actions">
                {link && isAdmin && <button className="btn btn-danger btn-sm" onClick={async () => { if (confirm(`Delete “${link.l.name}”? It goes to the trash.`) && (await run("deleteLink", { folderId: link.f.id, linkId: link.l.id }))) resolve(r.id, "link deleted"); }}>Delete link</button>}
                {link && isAdmin && <button className="btn btn-secondary btn-sm" onClick={async () => { if (await run("editLink", { folderId: link.f.id, linkId: link.l.id, status: "broken" })) resolve(r.id, "marked broken"); }}>Mark broken</button>}
                {r.kind === "message" && <button className="btn btn-danger btn-sm" onClick={async () => {
                  const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", ch: r.extra?.split(":")[0] || "general", id: r.targetId }) });
                  if (res.ok) resolve(r.id, "message deleted"); else toast((await res.json().catch(() => ({}))).error || "Couldn't delete");
                }}>Delete message</button>}
                {r.kind === "user" && r.extra?.startsWith("list:") && <button className="btn btn-danger btn-sm" onClick={async () => {
                  try { await admin("unpublishList", { username: r.targetId, list: r.extra!.slice(5), reason: r.reason }); resolve(r.id, "list taken down"); } catch (e: any) { toast(e.message); }
                }}>Stop sharing the list</button>}
                {r.kind === "user" && r.extra?.startsWith("list:") && <a className="btn btn-secondary btn-sm" href={`/u/${encodeURIComponent(r.targetId)}/list/${encodeURIComponent(r.extra.slice(5))}`} target="_blank" rel="noopener">See the list</a>}
                {r.kind === "picture" && <button className="btn btn-danger btn-sm" onClick={async () => {
                  try { await admin("removePicture", { username: r.targetId, reason: r.reason }); resolve(r.id, "picture removed"); } catch (e: any) { toast(e.message); }
                }}>Remove picture</button>}
                <button className="btn btn-secondary btn-sm" onClick={() => resolve(r.id)}>Dismiss</button>
              </div>
            </div>
          </div>
        );
      })}
      <FeedbackList info={info} admin={admin} refresh={refresh} toast={toast} />
      {isAdmin && <TrashList info={info} admin={admin} run={run} toast={toast} refresh={refresh} />}
    </>
  );
}

/**
 * New profile pictures, banners and other uploads waiting for a check.
 * Keys: A approves the first one, R rejects it.
 */
function PicturesQueue({ info, admin, refresh, toast }: { info: Extras; admin: AdminFn; refresh: () => void; toast: Toast }) {
  const pics = info.pictures || [];
  const [busy, setBusy] = useState(false);
  const review = async (id: string, ok: boolean, reason?: string) => {
    setBusy(true);
    try { await admin("reviewPicture", { id, ok, reason }); refresh(); } catch (e: any) { toast(e.message); } finally { setBusy(false); }
  };
  const reject = (id: string) => { const why = prompt("Why not? (optional — they'll see this)"); if (why !== null) review(id, false, why.trim() || undefined); };
  useEffect(() => {
    if (!pics.length) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (busy || e.ctrlKey || e.metaKey || e.altKey || (t && (t.closest("input, textarea, select, [contenteditable]")))) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); review(pics[0].id, true); }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); reject(pics[0].id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!pics.length) return null;
  const label: Record<string, string> = { avatar: "profile picture", banner: "banner", chat: "chat picture", icon: "website icon" };
  return (
    <section>
      <h3 className="admin-h">Pictures to check ({pics.length})</h3>
      <p className="hint">Press <span className="kbd">A</span> to approve the first one, <span className="kbd">R</span> to reject it.</p>
      <div className="pic-queue">
        {pics.map((p, i) => (
          <div key={p.id} className={`pic-card ${i === 0 ? "first" : ""}`}>
            <img className={p.kind === "banner" ? "wide" : ""} src={`/api/img/${p.id}`} alt={`${p.owner}'s new ${label[p.kind] || "picture"}`} />
            <div className="row-sub"><strong>{p.owner}</strong> · {label[p.kind] || p.kind}{p.type === "image/gif" ? " (moving)" : ""} · {ago(p.at)}</div>
            <div className="sugg-actions">
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => review(p.id, true)}>Approve</button>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => reject(p.id)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
      {pics.length > 1 && (
        <button className="btn btn-secondary btn-sm mt" disabled={busy} onClick={async () => {
          if (!confirm(`Approve all ${pics.length} pictures?`)) return;
          setBusy(true);
          for (const p of pics) { try { await admin("reviewPicture", { id: p.id, ok: true }); } catch {} }
          setBusy(false);
          refresh();
          toast(`Approved ${pics.length} pictures`);
        }}>Approve all {pics.length}</button>
      )}
    </section>
  );
}

/** A tiny 📋 next to a username that copies it. */
export function CopyName({ name, toast }: { name: string; toast: Toast }) {
  const copy = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(name).then(() => toast(`Copied “${name}”`)).catch(() => toast("Couldn't copy"));
  };
  return (
    <span className="copy-name" role="button" tabIndex={0} title={`Copy “${name}”`} aria-label={`Copy ${name}`}
      onClick={copy} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") copy(e); }}>📋</span>
  );
}

/** Ready-made answers for bug reports and messages (plus your own, kept on this device). */
const CANNED = [
  "Thanks — that's fixed now! 🎉",
  "Thanks for telling us — we'll look into it.",
  "Could you tell us a bit more? Which page were you on, and what did you click?",
  "That's how it's meant to work at the moment — thanks for the idea though!",
];

/** Bug reports and "message an admin", with replies; and how pages are rated. */
function FeedbackList({ info, admin, refresh, toast }: { info: Extras; admin: AdminFn; refresh: () => void; toast: Toast }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("cannedReplies") || "[]"); } catch { return []; } });
  const saveMine = (next: string[]) => { setMine(next); try { localStorage.setItem("cannedReplies", JSON.stringify(next)); } catch {} };
  const items = info.feedback || [];
  const ratings = Object.entries(info.pageRatings || {}).sort((a, b) => (b[1].good + b[1].ok + b[1].bad) - (a[1].good + a[1].ok + a[1].bad));
  return (
    <section>
      <h3 className="admin-h">Bug reports &amp; messages {items.filter((f) => !f.reply).length > 0 && `(${items.filter((f) => !f.reply).length} new)`}</h3>
      {items.length === 0 && <div className="admin-empty">Nothing yet.</div>}
      {items.map((f) => (
        <div key={f.id} className={`sugg-card ${f.reply ? "approved" : "pending"}`}>
          <div className="sugg-top"><span className="pill">{f.kind === "bug" ? "🐞 bug" : "✉️ message"}</span><strong>{f.user || "someone not logged in"}</strong><span className="row-sub inline">{ago(f.at)}{f.page ? ` · ${f.page}` : ""}</span></div>
          <div className="sugg-body">
            <div className="sugg-note" style={{ whiteSpace: "pre-wrap" }}>{f.text}</div>
            {f.device && <div className="row-sub">{f.device}</div>}
            {f.reply ? <div className="row-sub">↳ {f.reply.by}: “{f.reply.text}” · {ago(f.reply.at)}</div> : f.user && (
              <div className="status-row">
                <input value={drafts[f.id] || ""} onChange={(e) => setDrafts({ ...drafts, [f.id]: e.target.value })} placeholder="Reply (they get a notification)" maxLength={1000} />
                <button className="btn btn-primary btn-sm" disabled={!drafts[f.id]?.trim()} onClick={async () => { try { await admin("replyFeedback", { id: f.id, text: drafts[f.id] }); toast("Reply sent"); refresh(); } catch (e: any) { toast(e.message); } }}>Reply</button>
              </div>
            )}
            {!f.reply && f.user && (
              <div className="canned">
                {[...CANNED, ...mine].map((c) => (
                  <button key={c} className="pick" title={c} onClick={() => setDrafts({ ...drafts, [f.id]: c })}>
                    {c.length > 34 ? `${c.slice(0, 34)}…` : c}
                    {mine.includes(c) && <span className="ss-x" role="button" title="Forget this reply" onClick={(e) => { e.stopPropagation(); saveMine(mine.filter((x) => x !== c)); }}>×</span>}
                  </button>
                ))}
                {drafts[f.id]?.trim() && ![...CANNED, ...mine].includes(drafts[f.id].trim()) && (
                  <button className="link-btn" onClick={() => { saveMine([...mine, drafts[f.id].trim()].slice(-10)); toast("Saved as a ready-made reply"); }}>Save this reply for next time</button>
                )}
              </div>
            )}
            <div className="sugg-actions"><button className="btn btn-secondary btn-sm" onClick={async () => { await admin("deleteFeedback", { id: f.id }); refresh(); }}>{f.reply ? "Remove" : "Done"}</button></div>
          </div>
        </div>
      ))}
      {ratings.length > 0 && (
        <>
          <h3 className="admin-h">How pages feel</h3>
          <table className="mod-stats">
            <thead><tr><th>Page</th><th>😀</th><th>😐</th><th>🙁</th></tr></thead>
            <tbody>{ratings.map(([page, r]) => <tr key={page}><td className="mono">{page}</td><td>{r.good}</td><td>{r.ok}</td><td>{r.bad}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </section>
  );
}
function TrashList({ info, admin, run, toast, refresh }: { info: Extras; admin: AdminFn; run: Run; toast: Toast; refresh: () => void }) {
  const trash = info.trash || [];
  return (
    <section>
      <h3 className="admin-h">Trash <span className="muted-inline">— deleted in the last 30 days</span></h3>
      {trash.length === 0 && <div className="admin-empty">The trash is empty.</div>}
      {trash.map((t) => (
        <div key={t.id} className="admin-row">
          <div className="row-main">
            <div className="row-title">{t.kind === "folder" ? "📁" : "🔗"} {t.item.name || "(no name)"}</div>
            <div className="row-sub">{t.kind === "folder" ? `${(t.item.links || []).length} links` : `${t.folderName || ""} · ${t.item.url || ""}`} · deleted {ago(t.at)}{t.by ? ` by ${t.by}` : ""}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={async () => { if (await run("restoreTrash", { id: t.id })) { toast("Restored"); refresh(); } }}>Restore</button>
        </div>
      ))}
      {trash.length > 0 && <DangerButton label="Empty the trash" word="EMPTY" warning="Everything in the trash will be gone for good." onConfirm={async (w) => { try { await admin("emptyTrash", { confirm: w }); refresh(); } catch (e: any) { toast(e.message); } }} />}
    </section>
  );
}

/* ---------- site controls ---------- */
export function ControlsTab({ data, info, admin, run, refresh, toast }: { data: BookmarksData; info: Extras | null; admin: AdminFn; run: Run; refresh: () => void; toast: Toast }) {
  const s = data.settings || {};
  const [msg, setMsg] = useState(s.maintenanceMessage || "");
  const [blocked, setBlocked] = useState((s.blockedNames || []).join("\n"));
  const [words, setWords] = useState((s.wordFilter || []).join("\n"));
  const [reasons, setReasons] = useState((s.rejectReasons || DEFAULT_REASONS).join("\n"));
  const [inviteUses, setInviteUses] = useState(10);
  const [inviteDays, setInviteDays] = useState(7);
  const [from, setFrom] = useState(s.announceFrom?.slice(0, 16) || "");
  const [until, setUntil] = useState(s.announceUntil?.slice(0, 16) || "");
  const [tpl, setTpl] = useState({ name: "", folderId: data.folders[0]?.id || "", tags: "" });
  const [rules, setRules] = useState(s.rules || "");
  const save = (settings: Record<string, unknown>, done?: string) => run("setSettings", { settings }).then((ok) => { if (ok && done) toast(done); });
  const flag = (label: string, hint: string, key: string, value: boolean, invert = false) => (
    <label className="toggle-row compact">
      <div><strong>{label}</strong><span>{hint}</span></div>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => save({ [key]: invert ? !e.target.checked : e.target.checked })} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
  return (
    <>
      <h3 className="admin-h">Maintenance</h3>
      {flag("Read-only mode", "Only admins can change anything. Everyone sees a banner.", "maintenance", !!s.maintenance)}
      <div className="status-row">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Banner message, e.g. Back at 5pm" maxLength={200} />
        <button className="btn btn-secondary btn-sm" onClick={() => save({ maintenanceMessage: msg }, "Message saved")}>Save</button>
      </div>

      <h3 className="admin-h">Features</h3>
      {flag("Chat", "Let people send messages.", "chatEnabled", s.chatEnabled !== false)}
      {flag("Polls", "Show polls and let people vote.", "pollsEnabled", s.pollsEnabled !== false)}
      {flag("Suggestions", "Let members suggest changes.", "suggestionsEnabled", s.suggestionsEnabled !== false)}
      {flag("Community pages", "Boards, wiki and the Today strip.", "communityEnabled", s.communityEnabled !== false)}
      <div className="form-group">
        <label>Beta: only admins and beta testers see these ({(info?.beta || []).length} testers)</label>
        <div className="chip-grid">
          {["tools", "community", "wiki"].map((f) => {
            const on = (s.betaFlags || []).includes(f);
            return <button key={f} className={`pick ${on ? "on" : ""}`} aria-pressed={on} onClick={() => save({ betaFlags: on ? (s.betaFlags || []).filter((x) => x !== f) : [...(s.betaFlags || []), f] })}>{on ? "🧪" : "○"} {f}</button>;
          })}
        </div>
        <span className="hint">Add testers from People → pick someone → Add to beta testers.</span>
      </div>

      <h3 className="admin-h">Adding links</h3>
      {flag("Approve new links", "Members' links wait in Suggestions until an admin approves them. Contributors and folder maintainers skip the queue.", "approveLinks", !!s.approveLinks)}
      {flag("New accounts wait a day", "Accounts younger than 24 hours can only suggest links.", "newAccountWait", !!s.newAccountWait)}

      <h3 className="admin-h">Sign-ups</h3>
      <div className="seg" role="group" aria-label="Sign-ups">
        {(["open", "invite", "closed"] as const).map((m) => (
          <button key={m} className={(s.signups || "open") === m ? "on" : ""} onClick={() => save({ signups: m }, m === "open" ? "Anyone can sign up" : m === "invite" ? "Sign-up needs an invite code" : "Sign-ups closed")}>
            {m === "open" ? "Open" : m === "invite" ? "Invite code" : "Closed"}
          </button>
        ))}
      </div>
      {(s.signups === "invite" || (info?.invites || []).length > 0) && (
        <>
          <div className="status-row">
            <span className="row-sub">New code for</span>
            <input type="number" className="num-in" min={1} max={500} value={inviteUses} onChange={(e) => setInviteUses(Number(e.target.value))} aria-label="Uses" />
            <span className="row-sub">people, for</span>
            <input type="number" className="num-in" min={1} max={365} value={inviteDays} onChange={(e) => setInviteDays(Number(e.target.value))} aria-label="Days" />
            <span className="row-sub">days</span>
            <button className="btn btn-primary btn-sm" onClick={async () => { try { await admin("createInvite", { uses: inviteUses, days: inviteDays }); refresh(); } catch (e: any) { toast(e.message); } }}>Create</button>
          </div>
          {(info?.invites || []).map((i) => (
            <div key={i.code} className="admin-row compact">
              <div className="row-main"><div className="row-title mono">{i.code}</div><div className="row-sub">{i.uses}/{i.maxUses} used{i.expiresAt ? ` · until ${new Date(i.expiresAt).toLocaleDateString()}` : ""}</div></div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(i.code).then(() => toast("Copied"))}>Copy</button>
              <button className="btn-icon sm danger" title="Delete code" onClick={async () => { await admin("deleteInvite", { code: i.code }); refresh(); }}><Icon name="x" /></button>
            </div>
          ))}
        </>
      )}

      <h3 className="admin-h">Words and names</h3>
      <div className="form-group">
        <label>Blocked usernames <span className="muted-inline">— one per line; rude names are always blocked</span></label>
        <textarea value={blocked} onChange={(e) => setBlocked(e.target.value)} rows={3} />
        <button className="btn btn-secondary btn-sm" onClick={() => save({ blockedNames: blocked }, "Saved")}>Save</button>
      </div>
      <div className="form-group">
        <label>Word filter <span className="muted-inline">— hidden with ★ in chat, posts and suggestions</span></label>
        <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} />
        <button className="btn btn-secondary btn-sm" onClick={() => save({ wordFilter: words }, "Saved")}>Save</button>
      </div>

      <h3 className="admin-h">Limits</h3>
      <div className="form-group">
        <label>How strict the speed limits are: {(s.rateScale || 1) < 1 ? "stricter" : (s.rateScale || 1) > 1 ? "looser" : "normal"} (×{s.rateScale || 1})</label>
        <input type="range" min={0.25} max={3} step={0.25} value={s.rateScale || 1} onChange={(e) => save({ rateScale: Number(e.target.value) })} />
      </div>

      <h3 className="admin-h">Reviewing</h3>
      <div className="form-group">
        <label>Ready-made reasons for declining <span className="muted-inline">— one per line</span></label>
        <textarea value={reasons} onChange={(e) => setReasons(e.target.value)} rows={4} />
        <button className="btn btn-secondary btn-sm" onClick={() => save({ rejectReasons: reasons.split("\n") }, "Saved")}>Save</button>
      </div>
      <div className="form-group">
        <label>Approval templates <span className="muted-inline">— pick a folder and tags in one click when approving</span></label>
        {(s.approveTemplates || []).map((t, i) => (
          <div key={i} className="admin-row compact">
            <div className="row-main"><div className="row-title">{t.name}</div><div className="row-sub">{data.folders.find((f) => f.id === t.folderId)?.name || "?"}{t.tags.length ? ` · #${t.tags.join(" #")}` : ""}</div></div>
            <button className="btn-icon sm" title="Remove" onClick={() => save({ approveTemplates: (s.approveTemplates || []).filter((_, j) => j !== i) })}><Icon name="x" /></button>
          </div>
        ))}
        <div className="status-row">
          <input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="Name, e.g. Maths game" maxLength={40} />
          <select value={tpl.folderId} onChange={(e) => setTpl({ ...tpl, folderId: e.target.value })} aria-label="Folder">{data.folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}</select>
          <input value={tpl.tags} onChange={(e) => setTpl({ ...tpl, tags: e.target.value })} placeholder="tags, comma separated" />
          <button className="btn btn-secondary btn-sm" disabled={!tpl.name.trim()} onClick={() => { save({ approveTemplates: [...(s.approveTemplates || []), { ...tpl, tags: tpl.tags.split(",") }] }); setTpl({ ...tpl, name: "", tags: "" }); }}>Add</button>
        </div>
      </div>

      <h3 className="admin-h">Scheduled announcement</h3>
      <div className="status-row">
        <label className="row-sub">Show from <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="row-sub">until <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        <button className="btn btn-secondary btn-sm" onClick={() => save({ announceFrom: from ? new Date(from).toISOString() : "", announceUntil: until ? new Date(until).toISOString() : "" }, "Schedule saved")}>Save</button>
      </div>
      <p className="hint">Write the announcement itself in the Site tab. Leave both empty to always show it.</p>

      <h3 className="admin-h">Site rules</h3>
      <div className="form-group">
        <label>Shown at <a className="link-btn" href="/rules" target="_blank" rel="noopener">/rules</a> — new members agree to them when they sign up. Markdown works. Leave empty for the standard rules.</label>
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={6} maxLength={5000} placeholder="# Site rules…" />
        <button className="btn btn-secondary btn-sm" onClick={() => save({ rules }, "Rules saved")}>Save</button>
      </div>

      <h3 className="admin-h">Settings file</h3>
      <div className="admin-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={() => download(`site-settings-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(s, null, 2))}>Export settings</button>
        <label className="btn btn-secondary btn-sm">
          Import settings
          <input type="file" accept="application/json" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const json = JSON.parse(await file.text());
              if (!json || typeof json !== "object") throw new Error("Not a settings file");
              if (!confirm(`Replace the site settings with the ones in ${file.name}?`)) return;
              if (await run("setSettings", { settings: json })) toast("Settings imported");
            } catch (err: any) { toast(err.message || "Couldn't read that file"); }
            e.target.value = "";
          }} />
        </label>
      </div>
    </>
  );
}
export const DEFAULT_REASONS = [
  "It's already on the site",
  "It doesn't work at school",
  "Not appropriate for school",
  "Needs a paid account",
  "Doesn't fit any folder",
  "Duplicate suggestion",
];

/** Which moderator powers are switched on (owner only). */
export function ModPermsEditor({ data, info, run, toast }: { data: BookmarksData; info: Extras | null; run: Run; toast: Toast }) {
  const perms = data.settings?.modPerms || {};
  return (
    <section>
      <h3 className="admin-h">What moderators can do</h3>
      {(info?.modPermList || []).map((p) => (
        <label key={p.id} className="toggle-row compact">
          <div><strong>{p.label}</strong></div>
          <input type="checkbox" role="switch" checked={perms[p.id] !== false}
            onChange={(e) => run("setSettings", { settings: { modPerms: { ...perms, [p.id]: e.target.checked } } }).then((ok) => ok && toast("Saved"))} />
          <span className="switch" aria-hidden="true" />
        </label>
      ))}
      <ModStats info={info} />
    </section>
  );
}
function ModStats({ info }: { info: Extras | null }) {
  const rows = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const a of info?.audit || []) {
      if (!["mod", "admin", "owner"].includes(a.role)) continue;
      const m = map.get(a.actor) || {};
      const kind = /ban|timeout|freeze|warn/i.test(a.action) ? "people" : /Suggestion|Stage|Note/i.test(a.action) ? "reviews" : /Message|Chat/i.test(a.action) ? "chat" : /Report/i.test(a.action) ? "reports" : "other";
      m[kind] = (m[kind] || 0) + 1;
      map.set(a.actor, m);
    }
    return Array.from(map.entries()).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));
  }, [info?.audit]);
  if (!rows.length) return null;
  return (
    <>
      <h3 className="admin-h">What each moderator has handled</h3>
      <table className="mod-stats">
        <thead><tr><th>Who</th><th>Reviews</th><th>People</th><th>Chat</th><th>Reports</th><th>Other</th></tr></thead>
        <tbody>{rows.map(([who, m]) => <tr key={who}><td>{who}</td><td>{m.reviews || 0}</td><td>{m.people || 0}</td><td>{m.chat || 0}</td><td>{m.reports || 0}</td><td>{m.other || 0}</td></tr>)}</tbody>
      </table>
    </>
  );
}

/* ---------- audit log with filters, CSV and undo ---------- */
const UNDO: Record<string, string> = { ban: "unban", timeout: "endTimeout", freeze: "unfreeze" };
export function AuditTools({ items, admin, refresh, toast }: { items: NonNullable<Extras["audit"]>; admin: AdminFn; refresh: () => void; toast: Toast }) {
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const actors = Array.from(new Set(items.map((a) => a.actor)));
  const list = items.filter((a) => (!who || a.actor === who) && (!q || `${a.action} ${a.detail || ""}`.toLowerCase().includes(q.toLowerCase())));
  const csv = () => download(`audit-${new Date().toISOString().slice(0, 10)}.csv`, ["when,who,role,action,detail", ...list.map((a) => [a.at, a.actor, a.role, a.action, a.detail].map(csvCell).join(","))].join("\n"), "text/csv");
  return (
    <>
      <div className="admin-toolbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter actions…" />
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Who"><option value="">Everyone</option>{actors.map((a) => <option key={a}>{a}</option>)}</select>
        <button className="btn btn-secondary btn-sm" onClick={csv}>Export CSV</button>
      </div>
      {list.length === 0 && <div className="admin-empty">Nothing matches.</div>}
      {list.slice(0, 200).map((a, i) => {
        const undo = UNDO[a.action];
        const target = a.detail?.split(/\s/)[0];
        return (
          <div key={i} className="admin-row compact">
            <div className="row-main">
              <div className="row-title">{a.actor} <span className={`pill role-${a.role}`}>{a.role}</span> <span className="row-sub inline">{a.action}</span></div>
              <div className="row-sub">{a.detail} · {ago(a.at)}</div>
            </div>
            {undo && target && <button className="btn btn-secondary btn-sm" onClick={async () => { try { await admin(undo, { username: target }); toast(`Undone for ${target}`); refresh(); } catch (e: any) { toast(e.message); } }}>Undo</button>}
          </div>
        );
      })}
    </>
  );
}

/* ---------- data tools: find & replace, admin notes, chat export, errors ---------- */
export function DataTools({ data, info, admin, run, refresh, toast }: { data: BookmarksData; info: Extras | null; admin: AdminFn; run: Run; refresh: () => void; toast: Toast }) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const matches = useMemo(() => (find.length >= 3 ? data.folders.flatMap((f) => f.links.filter((l) => l.url.includes(find)).map((l) => ({ f, l }))) : []), [find, data]);
  return (
    <>
      <h3 className="admin-h">Find &amp; replace in addresses</h3>
      <div className="status-row">
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find, e.g. http://" className="mono" />
        <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with, e.g. https://" className="mono" />
      </div>
      {find.length >= 3 && (
        <div className="replace-preview">
          {matches.length === 0 ? <div className="admin-empty">No links match.</div> : matches.slice(0, 8).map(({ l }) => (
            <div key={l.id} className="diff-url"><del>{l.url}</del> → <ins>{l.url.split(find).join(replace)}</ins></div>
          ))}
          {matches.length > 8 && <div className="row-sub">…and {matches.length - 8} more</div>}
        </div>
      )}
      <button className="btn btn-primary btn-sm" disabled={!matches.length} onClick={async () => {
        if (!confirm(`Change ${matches.length} link address${matches.length === 1 ? "" : "es"}? You can use Undo straight after.`)) return;
        if (await run("replaceUrls", { find, replace })) { toast(`Updated ${matches.length} links`); setFind(""); setReplace(""); }
      }}>Replace in {matches.length} link{matches.length === 1 ? "" : "s"}</button>

      <h3 className="admin-h">Chat history</h3>
      <div className="admin-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={async () => {
          try {
            const { messages } = await admin("exportChat");
            download(`chat-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(messages, null, 2));
          } catch (e: any) { toast(e.message); }
        }}>Download as JSON</button>
        <button className="btn btn-secondary btn-sm" onClick={async () => {
          try {
            const { messages } = await admin("exportChat") as { messages: { at: string; channel?: string; user: string; text: string }[] };
            download(`chat-${new Date().toISOString().slice(0, 10)}.csv`, ["when,channel,user,text", ...messages.map((m) => [m.at, m.channel || "general", m.user, m.text].map(csvCell).join(","))].join("\n"), "text/csv");
          } catch (e: any) { toast(e.message); }
        }}>Download as CSV</button>
      </div>

      <h3 className="admin-h">Recent server errors</h3>
      {(info?.errors || []).length === 0 ? <div className="admin-empty">No errors logged. 👍</div> : (
        <>
          {(info?.errors || []).slice(0, 20).map((e, i) => <div key={i} className="row-sub error-row">{ago(e.at)} · <span className="mono">{e.message}</span></div>)}
          <button className="btn btn-secondary btn-sm" onClick={async () => { await admin("clearErrors"); refresh(); }}>Clear</button>
        </>
      )}
    </>
  );
}

/** Admin-only note on a link (never sent to members). */
export function AdminLinkNote({ link, notes, admin, refresh }: { link: Link; notes: Record<string, string>; admin: AdminFn; refresh: () => void }) {
  const has = notes[link.id];
  return (
    <button className={`btn-icon sm ${has ? "on" : ""}`} title={has ? `Admin note: ${has}` : "Add an admin-only note"} onClick={async () => {
      const text = prompt(`Admin-only note on “${link.name}” (members never see this):`, has || "");
      if (text === null) return;
      await admin("linkNote", { linkId: link.id, text });
      refresh();
    }}><Icon name="note" /></button>
  );
}

/** "Lock" + who can add/edit/see, for one folder. */
export function FolderPermsEditor({ folder, run, toast }: { folder: Folder; run: Run; toast: Toast }) {
  const p = folder.perm || {};
  const set = (patch: Record<string, string | undefined>) => run("editFolder", { folderId: folder.id, perm: { ...p, ...patch } }).then((ok) => ok && toast("Folder permissions saved"));
  return (
    <div className="folder-perms">
      <label>Add links<select value={p.add || "everyone"} onChange={(e) => set({ add: e.target.value })}><option value="everyone">Everyone</option><option value="contributors">Contributors &amp; maintainers</option><option value="admins">Admins only</option></select></label>
      <label>Edit links<select value={p.edit || "maintainers"} onChange={(e) => set({ edit: e.target.value })}><option value="maintainers">Maintainers &amp; admins</option><option value="admins">Admins only</option></select></label>
      <label>Who sees it<select value={p.view || "everyone"} onChange={(e) => set({ view: e.target.value })}><option value="everyone">Everyone</option><option value="members">Logged-in members</option></select></label>
      <button className={`btn btn-sm ${p.add === "admins" && p.edit === "admins" ? "btn-primary" : "btn-secondary"}`} onClick={() => set(p.add === "admins" && p.edit === "admins" ? { add: undefined, edit: undefined } : { add: "admins", edit: "admins" })}>
        <Icon name="lock" /> {p.add === "admins" && p.edit === "admins" ? "Unlock" : "Lock"}
      </button>
    </div>
  );
}

/* ---------- batch 12: health check, duplicates, CSV, backups, link checker ---------- */
const urlKey = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
/** Parse a CSV file (quotes, commas and new lines inside quotes are fine). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function DataHealth({ data, admin, run, toast }: { data: BookmarksData; admin: AdminFn; run: Run; toast: Toast }) {
  const report = useMemo(() => {
    const ids = new Set(data.folders.map((f) => f.id));
    const used = new Set(data.folders.flatMap((f) => f.links.flatMap((l) => l.tags || [])));
    const groups = new Map<string, { folder: Folder; link: Link }[]>();
    for (const f of data.folders) for (const l of f.links) { const k = urlKey(l.url); groups.set(k, [...(groups.get(k) || []), { folder: f, link: l }]); }
    const dupes = Array.from(groups.values()).filter((g) => g.length > 1);
    return {
      empty: data.folders.filter((f) => !f.links.length && !f.rule && !data.folders.some((c) => c.parentId === f.id)),
      unusedTags: Object.keys(data.settings?.tagColors || {}).filter((t) => !used.has(t)),
      orphans: data.folders.filter((f) => f.parentId && !ids.has(f.parentId)).length
        + data.folders.reduce((n, f) => n + f.links.filter((l) => l.alsoIn?.some((id) => !ids.has(id))).length, 0)
        + (data.settings?.startFolderId && !ids.has(data.settings.startFolderId) ? 1 : 0)
        + (data.settings?.featuredFolderId && !ids.has(data.settings.featuredFolderId) ? 1 : 0),
      http: data.folders.flatMap((f) => f.links.filter((l) => l.url.startsWith("http://")).map((l) => ({ f, l }))),
      dupes,
    };
  }, [data]);
  const fix = async (what: string, done: string) => { if (await run("healthFix", { fix: what })) toast(done); };
  const issues = report.empty.length + report.unusedTags.length + report.orphans + report.http.length + report.dupes.length;
  return (
    <section>
      <h3 className="admin-h">Health check {issues === 0 && "✅"}</h3>
      {issues === 0 && <div className="admin-empty">Everything looks tidy.</div>}
      {report.empty.length > 0 && (
        <div className="health-row"><div><strong>{report.empty.length} empty folder{report.empty.length === 1 ? "" : "s"}</strong><span>{report.empty.map((f) => `${f.emoji} ${f.name}`).join(", ")}</span></div>
          <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm("Delete the empty folders?")) fix("emptyFolders", "Empty folders removed"); }}>Remove</button></div>
      )}
      {report.unusedTags.length > 0 && (
        <div className="health-row"><div><strong>{report.unusedTags.length} tag colour{report.unusedTags.length === 1 ? "" : "s"} for tags nobody uses</strong><span>#{report.unusedTags.join(" #")}</span></div>
          <button className="btn btn-secondary btn-sm" onClick={() => fix("unusedTags", "Tidied tag colours")}>Tidy</button></div>
      )}
      {report.orphans > 0 && (
        <div className="health-row"><div><strong>{report.orphans} broken reference{report.orphans === 1 ? "" : "s"}</strong><span>Links or settings pointing at folders that were deleted.</span></div>
          <button className="btn btn-secondary btn-sm" onClick={() => fix("orphans", "References fixed")}>Fix</button></div>
      )}
      {report.dupes.length > 0 && (
        <div className="health-row"><div><strong>{report.dupes.length} website{report.dupes.length === 1 ? "" : "s"} added more than once</strong>
          <span>{report.dupes.slice(0, 4).map((g) => `${g[0].link.name} (${g.map((x) => x.folder.name).join(", ")})`).join(" · ")}{report.dupes.length > 4 ? " …" : ""}</span></div>
          <button className="btn btn-secondary btn-sm" onClick={async () => {
            if (!confirm(`Merge ${report.dupes.length} duplicate${report.dupes.length === 1 ? "" : "s"}? The oldest copy is kept, with all tags and likes, and it shows in the other folders too. The extras go to the trash.`)) return;
            if (await run("mergeDuplicates")) toast("Duplicates merged");
          }}>Merge</button></div>
      )}
      {report.http.length > 0 && (
        <div className="health-row"><div><strong>{report.http.length} link{report.http.length === 1 ? "" : "s"} still use http://</strong><span>Run the link checker to see which work on https, or switch them all.</span></div>
          <button className="btn btn-secondary btn-sm" onClick={async () => { if (confirm(`Switch ${report.http.length} links to https://?`) && (await run("httpsUpgrade"))) toast("Switched to https"); }}>Switch all</button></div>
      )}
      <LinkChecker data={data} admin={admin} run={run} toast={toast} />
    </section>
  );
}

interface Check { ok: boolean; status: number; at: string; finalUrl?: string; error?: string; httpsOk?: boolean }
function LinkChecker({ data, admin, run, toast }: { data: BookmarksData; admin: AdminFn; run: Run; toast: Toast }) {
  const [results, setResults] = useState<Record<string, Check> | null>(null);
  const [running, setRunning] = useState(false);
  const all = useMemo(() => data.folders.flatMap((f) => f.links.map((l) => ({ f, l }))), [data]);
  useEffect(() => { admin("linkResults").then((j) => setResults(j.results || {})).catch(() => setResults({})); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const checkAll = async () => {
    setRunning(true);
    try {
      // a few at a time so no single request runs too long
      for (let i = 0; i < Math.ceil(all.length / 8) && i < 40; i++) {
        const j = await admin("linkCheck", { max: 8 });
        setResults(j.results);
        if (!j.checked) break;
      }
      toast("Link check finished");
    } catch (e: any) { toast(e.message); } finally { setRunning(false); }
  };
  const broken = all.filter(({ l }) => results?.[l.id] && !results[l.id].ok);
  const httpsReady = all.filter(({ l }) => l.url.startsWith("http://") && results?.[l.id]?.httpsOk);
  const checked = all.filter(({ l }) => results?.[l.id]).length;
  return (
    <div className="link-checker">
      <div className="health-row">
        <div><strong>Link checker</strong><span>{checked}/{all.length} checked{broken.length ? ` · ${broken.length} not loading` : ""}</span></div>
        <button className="btn btn-secondary btn-sm" disabled={running} onClick={checkAll}>{running ? "Checking…" : "Check links"}</button>
      </div>
      {broken.map(({ f, l }) => (
        <div key={l.id} className="admin-row compact">
          <div className="row-main"><div className="row-title">{l.name} {l.status === "broken" && <span className="pill bad">marked broken</span>}</div>
            <div className="row-sub">{f.emoji} {f.name} · {results![l.id].error || `error ${results![l.id].status}`} · {l.url}</div></div>
        </div>
      ))}
      {broken.length > 0 && (
        <button className="btn btn-secondary btn-sm" onClick={async () => {
          if (await run("setLinkStatuses", { statuses: Object.fromEntries(broken.map(({ l }) => [l.id, "broken"])) })) toast(`Marked ${broken.length} as broken`);
        }}>Mark these as broken</button>
      )}
      {httpsReady.length > 0 && (
        <button className="btn btn-secondary btn-sm" onClick={async () => {
          if (await run("httpsUpgrade", { linkIds: httpsReady.map(({ l }) => l.id) })) toast(`Switched ${httpsReady.length} to https`);
        }}>Switch the {httpsReady.length} that work on https</button>
      )}
    </div>
  );
}

export function CsvImport({ data, run, toast }: { data: BookmarksData; run: Run; toast: Toast }) {
  const [rows, setRows] = useState<{ name: string; url: string; folder: string; tags: string }[] | null>(null);
  const have = useMemo(() => new Set(data.folders.flatMap((f) => f.links.map((l) => urlKey(l.url)))), [data]);
  return (
    <section>
      <h3 className="admin-h">Spreadsheet (CSV)</h3>
      <div className="admin-toolbar">
        <label className="btn btn-secondary btn-sm">
          Import a CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const table = parseCsv(await file.text());
            const head = (table[0] || []).map((h) => h.trim().toLowerCase());
            const col = (names: string[], fallback: number) => { const i = head.findIndex((h) => names.includes(h)); return i >= 0 ? i : fallback; };
            const hasHeader = head.some((h) => ["url", "link", "address", "name", "title"].includes(h));
            const [ni, ui, fi, ti] = [col(["name", "title"], 0), col(["url", "link", "address"], 1), col(["folder", "category"], 2), col(["tags", "tag"], 3)];
            const parsed = (hasHeader ? table.slice(1) : table).map((r) => ({ name: (r[ni] || "").trim(), url: (r[ui] || "").trim(), folder: (r[fi] || "").trim(), tags: (r[ti] || "").trim() })).filter((r) => r.url);
            if (!parsed.length) { toast("No links found — the file needs at least a url column"); return; }
            setRows(parsed);
          }} />
        </label>
        <button className="btn btn-secondary btn-sm" onClick={() => {
          const lines = ["name,url,folder,tags", ...data.folders.flatMap((f) => f.links.map((l) => [l.name, l.url, f.name, (l.tags || []).join(" ")].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")))];
          download(`bookmarks-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv");
        }}>Export everything as CSV</button>
      </div>
      {rows && (
        <div className="import-review">
          <strong>Import {rows.length} rows?</strong>
          <div className="row-sub">{rows.filter((r) => have.has(urlKey(r.url))).length} already on the site (skipped) · new folders: {Array.from(new Set(rows.map((r) => r.folder || "Imported"))).filter((n) => !data.folders.some((f) => f.name.toLowerCase() === n.toLowerCase())).join(", ") || "none"}</div>
          {rows.slice(0, 6).map((r, i) => <div key={i} className="row-sub">• {r.name || r.url} → {r.folder || "Imported"}{r.tags ? ` #${r.tags}` : ""}</div>)}
          <div className="admin-toolbar end">
            <button className="btn btn-secondary btn-sm" onClick={() => setRows(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={async () => {
              const r = rows; setRows(null);
              if (await run("importCsv", { rows: r.map((x) => ({ ...x, tags: x.tags.split(/[ ,;]+/).filter(Boolean) })) })) toast("Imported");
            }}>Import</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function Backups({ admin, run, toast }: { admin: AdminFn; run: Run; toast: Toast }) {
  const [list, setList] = useState<{ day: string; at: string; folders: number; links: number }[] | null>(null);
  const [diff, setDiff] = useState<{ day: string; d: { added: { name: string; folder: string }[]; removed: { name: string; folder: string }[]; changed: { before: { name: string; url: string }; after: { name: string; url: string } }[]; foldersAdded: string[]; foldersRemoved: string[] } } | null>(null);
  useEffect(() => { admin("backups").then((j) => setList(j.backups || [])).catch(() => setList([])); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <section>
      <h3 className="admin-h">Daily backups <span className="muted-inline">— kept for 14 days</span></h3>
      {!list && <div className="skeleton skel-line" />}
      {list && list.length === 0 && <div className="admin-empty">The first backup is made the next time something changes.</div>}
      {list?.map((b) => (
        <div key={b.day} className="admin-row compact">
          <div className="row-main"><div className="row-title">{new Date(`${b.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div><div className="row-sub">{b.folders} folders · {b.links} links · saved {ago(b.at)}</div></div>
          <button className="btn btn-secondary btn-sm" onClick={async () => { try { setDiff({ day: b.day, d: (await admin("backupDiff", { day: b.day })).diff }); } catch (e: any) { toast(e.message); } }}>What changed since</button>
          <DangerButton label="Restore" word="RESTORE" warning={`Put everything back to how it was on ${b.day}? Changes since then will be lost (you can use Undo straight after).`}
            onConfirm={async (w) => { if (await run("restoreBackup", { day: b.day, confirm: w })) toast(`Restored ${b.day}`); }} />
        </div>
      ))}
      {diff && (
        <div className="import-review">
          <strong>Since {diff.day}</strong>
          <div className="row-sub">+{diff.d.added.length} added · −{diff.d.removed.length} removed · {diff.d.changed.length} changed{diff.d.foldersAdded.length ? ` · new folders: ${diff.d.foldersAdded.join(", ")}` : ""}{diff.d.foldersRemoved.length ? ` · folders gone: ${diff.d.foldersRemoved.join(", ")}` : ""}</div>
          {diff.d.added.slice(0, 8).map((l, i) => <div key={`a${i}`} className="row-sub">+ {l.name} ({l.folder})</div>)}
          {diff.d.removed.slice(0, 8).map((l, i) => <div key={`r${i}`} className="row-sub">− {l.name} ({l.folder})</div>)}
          {diff.d.changed.slice(0, 8).map((c, i) => <div key={`c${i}`} className="row-sub">~ {c.before.name}{c.before.name !== c.after.name ? ` → ${c.after.name}` : ""}</div>)}
          <div className="admin-toolbar end"><button className="btn btn-secondary btn-sm" onClick={() => setDiff(null)}>Close</button></div>
        </div>
      )}
    </section>
  );
}
