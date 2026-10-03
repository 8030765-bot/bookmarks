"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityEntry, BookmarksData, Folder } from "@/lib/types";
import { Icon } from "./Icon";
import Markdown from "./Markdown";
import type { FolderPref } from "./Personal";
import { StarRating } from "./Personal";
import { ageLabel, asMarkdown, timeAgo } from "./ui";

export const FOLDER_SORTS: [string, string][] = [
  ["manual", "Folder order"], ["name", "A–Z"], ["newest", "Newest first"], ["clicks", "Most visited"], ["rating", "Top rated"], ["mine", "My ratings"],
];

export interface FolderMenuState { folder: Folder; x: number; y: number }

/** ⋯ menu on a folder header. */
export function FolderMenu({
  state,
  pref,
  admin,
  editor,
  isStart,
  view,
  sort,
  onClose,
  actions,
}: {
  state: FolderMenuState;
  pref: FolderPref;
  admin: boolean;
  /** admin, or a maintainer of this folder */
  editor: boolean;
  isStart: boolean;
  view: "grid" | "list";
  sort: string;
  onClose: () => void;
  actions: {
    setPref: (patch: Partial<FolderPref>) => void;
    toggleView: () => void;
    random: () => void;
    openAll: () => void;
    copyLink: () => void;
    copyMarkdown: () => void;
    info: () => void;
    note: () => void;
    edit: () => void;
    duplicate: () => void;
    merge: () => void;
    split: () => void;
    archive: () => void;
    makeStart: () => void;
    remove: () => void;
  };
}) {
  const { folder } = state;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.x, top: state.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(state.x - r.width, innerWidth - r.width - 8)), top: Math.max(8, Math.min(state.y, innerHeight - r.height - 8)) });
  }, [state.x, state.y]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onClose, { passive: true });
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("scroll", onClose); };
  }, [onClose]);
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const linkCount = folder.links.length;

  return (
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div ref={ref} className="menu card-menu" role="menu" style={{ position: "fixed", left: pos.left, top: pos.top }}>
        <div className="menu-head">{folder.emoji} {folder.name}<strong className="menu-sub">{linkCount} websites{folder.rule ? " · smart folder" : ""}</strong></div>
        <div className="menu-label">Sort this folder (just for you)</div>
        <div className="menu-chips">
          {FOLDER_SORTS.map(([v, l]) => (
            <button key={v} className={sort === v ? "on" : ""} onClick={() => actions.setPref({ sort: v === "manual" && !folder.sort ? undefined : v })}>{l}</button>
          ))}
        </div>
        <button onClick={run(actions.toggleView)}><Icon name={view === "grid" ? "list" : "grid"} /> Show as {view === "grid" ? "a list" : "a grid"}</button>
        <button onClick={run(actions.info)}><Icon name="info" /> About this folder</button>
        <button onClick={run(actions.note)}><Icon name="note" /> {pref.note ? "Edit my note" : "Add a private note"}</button>
        <div className="menu-sep" />
        {linkCount > 0 && <button onClick={run(actions.random)}><Icon name="shuffle" /> Random website from here</button>}
        {linkCount > 0 && <button onClick={run(actions.openAll)}><Icon name="external" /> Open all</button>}
        <button onClick={run(actions.copyLink)}><Icon name="share" /> Copy link to this folder</button>
        {linkCount > 0 && <button onClick={run(actions.copyMarkdown)}><Icon name="link" /> Copy as a Markdown list</button>}
        <div className="menu-sep" />
        <button onClick={run(() => actions.setPref({ fav: !pref.fav }))}><Icon name="star" /> {pref.fav ? "Unfavorite folder" : "Favorite folder (shows first)"}</button>
        <button onClick={run(() => actions.setPref({ follow: !pref.follow }))}><Icon name="bell" /> {pref.follow ? "Stop following" : "Follow — tell me about new links"}</button>
        <button onClick={run(() => actions.setPref({ hidden: !pref.hidden }))}><Icon name={pref.hidden ? "eye" : "eyeOff"} /> {pref.hidden ? "Unhide folder" : "Hide folder for me"}</button>
        {editor && (
          <>
            <div className="menu-sep" />
            <button onClick={run(actions.edit)}><Icon name="edit" /> Edit folder</button>
          </>
        )}
        {admin && (
          <>
            <button onClick={run(actions.duplicate)}><Icon name="copy" /> Duplicate</button>
            <button onClick={run(actions.merge)}><Icon name="move" /> Merge into another folder…</button>
            {linkCount > 0 && <button onClick={run(actions.split)}><Icon name="tag" /> Split out by tag…</button>}
            <button onClick={run(actions.makeStart)}><Icon name="pin" /> {isStart ? "Stop being the “Start here” folder" : "Make this the “Start here” folder"}</button>
            <button onClick={run(actions.archive)}><Icon name="database" /> {folder.archived ? "Unarchive" : "Archive (hide from members)"}</button>
            <button className="danger" onClick={run(actions.remove)}><Icon name="trash" /> Delete folder</button>
          </>
        )}
      </div>
    </>
  );
}

/** Drawer with everything about one folder: description, guide, contributors, history, stats. */
export function FolderInfo({
  folder,
  data,
  me,
  done,
  myRating,
  rating,
  onRate,
  onProfile,
  onClose,
}: {
  folder: Folder;
  data: BookmarksData;
  me: string | null;
  /** how many of its links you've marked done */
  done: number;
  myRating?: number;
  rating?: { avg: number; count: number };
  onRate: (stars: number) => void;
  onProfile: (u: string) => void;
  onClose: () => void;
}) {
  const contributors = useMemo(() => {
    const counts = new Map<string, number>();
    folder.links.forEach((l) => l.addedBy && counts.set(l.addedBy, (counts.get(l.addedBy) || 0) + 1));
    return Array.from(counts).sort((a, b) => b[1] - a[1]);
  }, [folder]);
  const history: ActivityEntry[] = (data.activity || []).filter((a) => a.folderId === folder.id).slice(0, 20);
  const visits = folder.links.reduce((n, l) => n + (l.clicks || 0), 0);
  const subs = data.folders.filter((f) => f.parentId === folder.id);
  const parent = folder.parentId ? data.folders.find((f) => f.id === folder.parentId) : undefined;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label={`About ${folder.name}`}>
        <div className="drawer-head">
          <strong>{folder.emoji} {folder.name}</strong>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body folder-info">
          {parent && <p className="muted-inline">Inside {parent.emoji} {parent.name}</p>}
          {folder.description && <p className="fi-desc">{folder.description}</p>}
          {folder.rule && <p className="fi-rule">Smart folder — shows everything matching <code>{folder.rule}</code></p>}
          <div className="profile-stats">
            <div><strong>{folder.links.length}</strong><span>websites</span></div>
            <div><strong>{visits}</strong><span>visits</span></div>
            {folder.links.length > 0 && <div><strong>{done}/{folder.links.length}</strong><span>you&apos;ve done</span></div>}
            {subs.length > 0 && <div><strong>{subs.length}</strong><span>sub-folders</span></div>}
          </div>
          <div className="fi-rate">
            <span>Rate this folder</span>
            <StarRating linkId={`f_${folder.id}`} mine={myRating} avg={rating?.avg} count={rating?.count} canRate={!!me} onRate={(_id, s) => onRate(s)} />
            {rating?.count ? <span className="muted-inline">{rating.avg}★ from {rating.count}</span> : null}
          </div>
          {folder.guide && (
            <>
              <div className="admin-h">Guide</div>
              <Markdown text={folder.guide} className="fi-guide" />
            </>
          )}
          {contributors.length > 0 && (
            <>
              <div className="admin-h">Contributors</div>
              <div className="fi-people">
                {contributors.map(([name, n]) => (
                  <button key={name} className="pick" onClick={() => onProfile(name)}>{name} <em>{n}</em></button>
                ))}
              </div>
            </>
          )}
          {folder.maintainers?.length ? <p className="muted-inline">Looked after by {folder.maintainers.join(", ")}</p> : null}
          <div className="admin-h">History</div>
          {history.length === 0 && <div className="admin-empty">No changes recorded yet.</div>}
          <div className="timeline">
            {history.map((a) => (
              <div key={a.id} className="timeline-item">
                <span className={`tl-dot ${a.action}`} />
                <span className="tl-text">{a.detail}{a.by ? <em className="muted-inline"> · {a.by}</em> : null}</span>
                <span className="tl-time">{timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
          {folder.createdAt && <p className="muted-inline fi-created">Made {ageLabel(folder.createdAt)}</p>}
        </div>
      </aside>
    </div>
  );
}

/** Admin: every tag on the site with counts — rename, merge, colour or remove. */
export function TagManager({
  data,
  onRename,
  onDelete,
  onColor,
  onClose,
}: {
  data: BookmarksData;
  onRename: (from: string, to: string) => Promise<boolean>;
  onDelete: (tag: string) => Promise<boolean>;
  onColor: (tag: string, color: string) => void;
  onClose: () => void;
}) {
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    data.folders.forEach((f) => f.links.forEach((l) => l.tags?.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))));
    return Array.from(counts).sort((a, b) => b[1] - a[1]);
  }, [data]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const colors = data.settings?.tagColors || {};
  const PALETTE = ["", "#7c6cff", "#3dd68c", "#ffb84d", "#ff5c7a", "#4dabff", "#e879f9", "#2dd4bf"];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Manage tags</h2>
        <p className="modal-text">Renaming a tag to one that already exists merges them.</p>
        {tags.length === 0 && <div className="admin-empty">No tags yet.</div>}
        <div className="admin-list tag-manager">
          {tags.map(([t, n]) => (
            <div key={t} className="admin-row">
              {editing === t ? (
                <form className="row-edit" onSubmit={async (e) => { e.preventDefault(); if (draft.trim() && (await onRename(t, draft.trim()))) setEditing(null); }}>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={24} />
                  <div className="row-edit-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm">Rename</button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="tag" style={colors[t] ? { background: `${colors[t]}26`, color: colors[t] } : undefined}>{t}</span>
                  <span className="row-sub inline">{n} link{n === 1 ? "" : "s"}</span>
                  <div className="tag-colors">
                    {PALETTE.map((c) => (
                      <button key={c || "none"} className={`swatch tiny ${c ? "" : "none"} ${(colors[t] || "") === c ? "on" : ""}`} style={c ? { background: c } : undefined} title={c || "No colour"} onClick={() => onColor(t, c)} />
                    ))}
                  </div>
                  <button className="btn-icon sm" title="Rename / merge" onClick={() => { setEditing(t); setDraft(t); }}><Icon name="edit" /></button>
                  <button className="btn-icon sm danger" title="Remove this tag everywhere" onClick={() => { if (confirm(`Remove #${t} from ${n} links?`)) onDelete(t); }}><Icon name="trash" /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

/** Pick a folder (for merge) or a tag (for split). */
export function PickModal({
  title,
  text,
  options,
  confirmLabel,
  onPick,
  onClose,
}: {
  title: string;
  text: string;
  options: { value: string; label: string }[];
  confirmLabel: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(options[0]?.value || "");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="modal-text">{text}</p>
        <div className="form-group">
          <select value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!value} onClick={() => { onPick(value); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function folderMarkdown(folder: Folder) {
  return [`## ${folder.emoji} ${folder.name}`, ...folder.links.map((l) => `- ${asMarkdown(l)}`)].join("\n");
}
