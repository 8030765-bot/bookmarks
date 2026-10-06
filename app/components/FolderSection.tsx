"use client";
import { ReactNode, useEffect, useState } from "react";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import LinkCard, { Highlight } from "./LinkCard";
import { useCardEnv } from "./cardEnv";
import { hostOf, timeAgo } from "./ui";
import type { LinkRef } from "./ui";

/** Extra facts shown in a folder's header. */
export interface FolderMeta {
  /** newest add/edit in the folder (ms) */
  updatedAt: number;
  /** last time you opened something from it, on this device (ms) */
  visitedAt?: number;
  /** links added since your last visit */
  unread: number;
  /** links you've marked done */
  done: number;
  fav?: boolean;
  follow?: boolean;
  /** your private sticky note on the folder */
  note?: string;
  onNote?: () => void;
}

export type Drag = { kind: "link"; folderId: string; linkId: string } | { kind: "folder"; folderId: string } | null;

/** A link dragged in from another tab or the address bar. */
function droppedUrl(e: React.DragEvent): string {
  const uri = e.dataTransfer.getData("text/uri-list").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  return uri || e.dataTransfer.getData("text/plain").trim();
}
const carriesUrl = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("text/uri-list");

const SHOW_FIRST = 30;

export default function FolderSection({
  folder,
  links,
  shortcuts,
  totalLinks,
  collapsed,
  view,
  canAdd,
  dragEnabled,
  drag,
  setDrag,
  dropTarget,
  setDropTarget,
  onToggle,
  onAddHere,
  onOpenAll,
  onEditFolder,
  onDeleteFolder,
  onShareFolder,
  onMoveLink,
  onMoveFolder,
  onDropUrl,
  onMenu,
  meta,
  sub,
  children,
  editor,
  virtual,
  onSplit,
}: {
  folder: Folder;
  links: Link[];
  /** links from other folders that are also shown here */
  shortcuts: LinkRef[];
  totalLinks: number;
  collapsed: boolean;
  view: "grid" | "list";
  canAdd: boolean;
  dragEnabled: boolean;
  drag: Drag;
  setDrag: (d: Drag) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
  onToggle: () => void;
  onAddHere: () => void;
  onOpenAll: () => void;
  onEditFolder: () => void;
  onDeleteFolder: () => void;
  onShareFolder: () => void;
  onMoveLink: (from: { folderId: string; linkId: string }, toFolderId: string, beforeLinkId: string | null) => void;
  onMoveFolder: (folderId: string, beforeFolderId: string) => void;
  onDropUrl: (folderId: string, url: string) => void;
  onMenu: (at: { x: number; y: number }) => void;
  meta: FolderMeta;
  /** drawn as a sub-folder inside its parent */
  sub?: boolean;
  /** this folder's sub-folders */
  children?: ReactNode;
  /** admin, or one of this folder's maintainers */
  editor: boolean;
  /** a built-in list ("Most popular"…) rather than a real folder */
  virtual?: boolean;
  /** admin hint for very long folders */
  onSplit?: () => void;
}) {
  const { admin, query } = useCardEnv();
  const [urlOver, setUrlOver] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  if (f) {
    // the quick filter inside one folder
    links = links.filter((l) => `${l.name} ${hostOf(l.url)} ${(l.tags || []).join(" ")}`.toLowerCase().includes(f));
    shortcuts = shortcuts.filter((r) => `${r.link.name} ${hostOf(r.link.url)}`.toLowerCase().includes(f));
  }
  const filtered = links.length !== totalLinks;
  const smart = !!folder.rule;
  const progress = totalLinks ? Math.round((meta.done / totalLinks) * 100) : 0;
  const linkDragging = drag?.kind === "link";
  const folderDragging = drag?.kind === "folder" && drag.folderId !== folder.id;
  const isFolderDrop = dropTarget === `folder:${folder.id}`;
  const isEndDrop = dropTarget === `end:${folder.id}`;
  const count = links.length + shortcuts.length;
  // big folders show the first few dozen, with "Show all" (searching always shows everything)
  const [showAll, setShowAll] = useState(() => {
    if (typeof location === "undefined" || !location.hash.startsWith("#link-")) return false;
    return links.findIndex((l) => l.id === location.hash.slice(6)) >= SHOW_FIRST; // a link to a website further down
  });
  // printing a folder shows all of it
  useEffect(() => {
    const onShowAll = (e: Event) => { if ((e as CustomEvent).detail === folder.id) setShowAll(true); };
    window.addEventListener("show-all-folder", onShowAll);
    return () => window.removeEventListener("show-all-folder", onShowAll);
  }, [folder.id]);
  const capped = !showAll && !f && !query.trim() && links.length > SHOW_FIRST + 6;
  const shownLinks = capped ? links.slice(0, SHOW_FIRST) : links;

  return (
    <section
      id={`folder-${folder.id}`}
      className={`folder-card ${folder.pinned ? "pinned" : ""} ${isEndDrop || urlOver ? "drop-into" : ""} ${sub ? "sub-folder" : ""} ${folder.archived ? "archived" : ""}`}
      style={folder.color ? ({ "--folder-accent": folder.color } as React.CSSProperties) : undefined}
      onDragOver={(e) => {
        if (!drag && canAdd && !smart && carriesUrl(e)) {
          // a link dragged in from outside the page
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!urlOver) setUrlOver(true);
          return;
        }
        if (!linkDragging) return;
        e.preventDefault();
        if (dropTarget !== `end:${folder.id}` && !dropTarget?.startsWith("link:")) setDropTarget(`end:${folder.id}`);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) { setDropTarget(null); setUrlOver(false); }
      }}
      onDrop={(e) => {
        if (!drag && carriesUrl(e)) {
          e.preventDefault();
          setUrlOver(false);
          const url = droppedUrl(e);
          if (url) onDropUrl(folder.id, url);
          return;
        }
        if (drag?.kind !== "link") return;
        e.preventDefault();
        onMoveLink(drag, folder.id, null);
      }}
    >
      <header
        className={`fh ${isFolderDrop ? "drop-before" : ""}`}
        draggable={admin && dragEnabled && !sub}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", folder.id);
          setDrag({ kind: "folder", folderId: folder.id });
        }}
        onDragEnd={() => { setDrag(null); setDropTarget(null); }}
        onDragOver={(e) => {
          if (!folderDragging) return;
          e.preventDefault();
          e.stopPropagation();
          setDropTarget(`folder:${folder.id}`);
        }}
        onDrop={(e) => {
          if (drag?.kind !== "folder") return;
          e.preventDefault();
          e.stopPropagation();
          onMoveFolder(drag.folderId, folder.id);
        }}
      >
        <button className="fh-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <span className={`chev ${collapsed ? "" : "open"}`}><Icon name="down" /></span>
          <span className="fh-emoji">{folder.emoji}</span>
          <span className="fh-name"><Highlight text={folder.name} query={query} /></span>
          <span className="fh-count">{filtered ? `${links.length}/${totalLinks}` : totalLinks}</span>
          {meta.unread > 0 && <span className="fh-unread" title={`${meta.unread} new since your last visit`}>{meta.unread} new</span>}
          {folder.pinned && <span className="fh-pin" title="Pinned"><Icon name="pin" /></span>}
          {meta.fav && <span className="fh-fav" title="One of your favorite folders"><Icon name="star" /></span>}
          {meta.follow && <span className="fh-follow" title="You follow this folder"><Icon name="bell" /></span>}
          {smart && <span className="pill smart" title={`Shows everything matching: ${folder.rule}`}>smart</span>}
          {folder.archived && <span className="pill warn">archived</span>}
          <span className="fh-when">
            {meta.updatedAt ? `updated ${timeAgo(new Date(meta.updatedAt).toISOString())}` : ""}
            {meta.visitedAt ? ` · you: ${timeAgo(new Date(meta.visitedAt).toISOString())}` : ""}
          </span>
        </button>
        <div className="fh-actions">
          {admin && dragEnabled && !sub && <span className="drag-handle" title="Drag to reorder folders"><Icon name="grip" /></span>}
          {totalLinks > 8 && (
            <button className={`btn-icon ${filterOpen ? "on" : ""}`} title="Filter this folder" onClick={() => { setFilterOpen(!filterOpen); if (filterOpen) setFilter(""); }}>
              <Icon name="search" />
            </button>
          )}
          {canAdd && !smart && !virtual && <button className="btn-icon" title={`Add a website to ${folder.name}`} onClick={onAddHere}><Icon name="plus" /></button>}
          {links.length + shortcuts.length > 0 && <button className="btn-icon" title="Open all in new tabs" onClick={onOpenAll}><Icon name="external" /></button>}
          {!virtual && <button className="btn-icon" title="Copy a link to this folder" onClick={onShareFolder}><Icon name="share" /></button>}
          {editor && !virtual && <button className="btn-icon" title="Edit folder" onClick={onEditFolder}><Icon name="edit" /></button>}
          {admin && !virtual && <button className="btn-icon danger" title="Delete folder" onClick={onDeleteFolder}><Icon name="trash" /></button>}
          {!virtual && <button
            className="btn-icon"
            title="More: sort, follow, favorite, about…"
            onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu({ x: r.right, y: r.bottom + 4 }); }}
          >
            <Icon name="more" />
          </button>}
        </div>
      </header>
      {(folder.description || (meta.done > 0 && totalLinks > 0) || (onSplit && totalLinks > 40)) && !collapsed && (
        <div className="fh-sub">
          {folder.description && <span className="fh-desc">{folder.description}</span>}
          {onSplit && totalLinks > 40 && (
            <button className="link-btn fh-long" onClick={onSplit} title="Admins only">Long folder — split some out by tag?</button>
          )}
          {meta.done > 0 && totalLinks > 0 && (
            <span className="fh-progress" title={`You've done ${meta.done} of ${totalLinks}`}>
              <span className="bar"><span style={{ width: `${progress}%` }} /></span> {meta.done}/{totalLinks} done
            </span>
          )}
        </div>
      )}
      {meta.note && !collapsed && (
        <button className="fh-note" onClick={meta.onNote} title="Your private note — only you see it. Click to edit.">
          <Icon name="note" /> <span>{meta.note}</span>
        </button>
      )}
      {filterOpen && !collapsed && (
        <div className="fh-filter">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${folder.name}…`} autoFocus
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setFilter(""); setFilterOpen(false); } }} />
        </div>
      )}

      {urlOver && <div className="url-drop-hint"><Icon name="plus" /> Drop to add this link to {folder.emoji} {folder.name}</div>}
      {!collapsed && (
        count === 0 ? (children && !filtered ? null :
          <div className="folder-empty">
            {smart ? <>Nothing matches <code>{folder.rule}</code> yet.</> : filtered ? "Nothing in this folder matches." : (
              <>
                This folder is empty.
                {canAdd && <button className="btn btn-secondary btn-sm" onClick={onAddHere}><Icon name="plus" /> Add the first website</button>}
                {canAdd && <span className="hint">…or drag a link here from another tab.</span>}
              </>
            )}
          </div>
        ) : (
          <>
          {links.length > 20 && !f && (
            // A–Z index for long folders: jump to the first website starting with a letter
            <div className="az-index" aria-label="Jump to letter">
              {Array.from(new Set(links.map((l) => (l.name.trim()[0] || "#").toUpperCase().replace(/[^A-Z]/, "#")))).sort().map((ch) => (
                <button
                  key={ch}
                  onClick={(e) => {
                    setShowAll(true);
                    const section = (e.currentTarget as HTMLElement).closest(".folder-card");
                    const card = Array.from(section?.querySelectorAll<HTMLElement>(".card[data-link-id]") || [])
                      .find((c) => ((c.querySelector(".card-title")?.textContent || "").trim()[0] || "#").toUpperCase().replace(/[^A-Z]/, "#") === ch);
                    card?.scrollIntoView({ behavior: "smooth", block: "center" });
                    card?.classList.add("flash-card");
                    setTimeout(() => card?.classList.remove("flash-card"), 1200);
                  }}
                >{ch}</button>
              ))}
            </div>
          )}
          <div className={`cards ${view === "list" ? "list" : ""}`}>
            {shownLinks.map((link) => (
              <LinkCard
                key={link.id}
                folder={folder}
                link={link}
                draggable={admin && dragEnabled}
                dropBefore={dropTarget === `link:${link.id}`}
                onDragStart={() => setDrag({ kind: "link", folderId: folder.id, linkId: link.id })}
                onDragEnd={() => { setDrag(null); setDropTarget(null); }}
                onDragOver={(e) => {
                  if (drag?.kind !== "link" || drag.linkId === link.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTarget(`link:${link.id}`);
                }}
                onDrop={(e) => {
                  if (drag?.kind !== "link") return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (drag.linkId !== link.id) onMoveLink(drag, folder.id, link.id);
                }}
              />
            ))}
            {shortcuts.map(({ folder: home, link }) => (
              <LinkCard
                key={`sc-${link.id}`}
                folder={home}
                link={link}
                shortcutIn={folder}
                draggable={false}
                dropBefore={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                onDragOver={() => {}}
                onDrop={() => {}}
              />
            ))}
          </div>
          {capped && (
            <button className="show-more" onClick={() => setShowAll(true)}>
              Show all {links.length} websites <span className="muted-inline">({links.length - SHOW_FIRST} more)</span>
            </button>
          )}
          {showAll && links.length > SHOW_FIRST + 6 && !f && !query.trim() && (
            <button className="show-more" onClick={() => { setShowAll(false); document.getElementById(`folder-${folder.id}`)?.scrollIntoView({ block: "start" }); }}>Show fewer</button>
          )}
          </>
        )
      )}
      {!collapsed && children && <div className="sub-folders">{children}</div>}
    </section>
  );
}
