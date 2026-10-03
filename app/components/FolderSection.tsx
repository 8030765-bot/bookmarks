"use client";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import LinkCard, { Highlight, LinkCardActions } from "./LinkCard";

export type Drag = { kind: "link"; folderId: string; linkId: string } | { kind: "folder"; folderId: string } | null;

export default function FolderSection({
  folder,
  links,
  totalLinks,
  collapsed,
  query,
  view,
  admin,
  me,
  favorites,
  ratings,
  myRatings,
  canAdd,
  dragEnabled,
  drag,
  setDrag,
  dropTarget,
  setDropTarget,
  actions,
  onToggle,
  onAddHere,
  onOpenAll,
  onEditFolder,
  onDeleteFolder,
  onShareFolder,
  onMoveLink,
  onMoveFolder,
}: {
  folder: Folder;
  links: Link[];
  totalLinks: number;
  collapsed: boolean;
  query: string;
  view: "grid" | "list";
  admin: boolean;
  me: string | null;
  favorites: Set<string>;
  ratings: Record<string, { avg: number; count: number }>;
  myRatings: Record<string, number>;
  canAdd: boolean;
  dragEnabled: boolean;
  drag: Drag;
  setDrag: (d: Drag) => void;
  dropTarget: string | null;
  setDropTarget: (id: string | null) => void;
  actions: LinkCardActions;
  onToggle: () => void;
  onAddHere: () => void;
  onOpenAll: () => void;
  onEditFolder: () => void;
  onDeleteFolder: () => void;
  onShareFolder: () => void;
  onMoveLink: (from: { folderId: string; linkId: string }, toFolderId: string, beforeLinkId: string | null) => void;
  onMoveFolder: (folderId: string, beforeFolderId: string) => void;
}) {
  const filtered = links.length !== totalLinks;
  const linkDragging = drag?.kind === "link";
  const folderDragging = drag?.kind === "folder" && drag.folderId !== folder.id;
  const isFolderDrop = dropTarget === `folder:${folder.id}`;
  const isEndDrop = dropTarget === `end:${folder.id}`;

  return (
    <section
      id={`folder-${folder.id}`}
      className={`folder-card ${folder.pinned ? "pinned" : ""} ${isEndDrop ? "drop-into" : ""}`}
      style={folder.color ? ({ "--folder-accent": folder.color } as React.CSSProperties) : undefined}
      onDragOver={(e) => {
        if (!linkDragging) return;
        e.preventDefault();
        if (dropTarget !== `end:${folder.id}` && !dropTarget?.startsWith("link:")) setDropTarget(`end:${folder.id}`);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
      }}
      onDrop={(e) => {
        if (drag?.kind !== "link") return;
        e.preventDefault();
        onMoveLink(drag, folder.id, null);
      }}
    >
      <header
        className={`fh ${isFolderDrop ? "drop-before" : ""}`}
        draggable={admin && dragEnabled}
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
          {folder.pinned && <span className="fh-pin" title="Pinned"><Icon name="pin" /></span>}
        </button>
        <div className="fh-actions">
          {admin && dragEnabled && <span className="drag-handle" title="Drag to reorder folders"><Icon name="grip" /></span>}
          {canAdd && <button className="btn-icon" title={`Add a website to ${folder.name}`} onClick={onAddHere}><Icon name="plus" /></button>}
          {links.length > 0 && <button className="btn-icon" title="Open all in new tabs" onClick={onOpenAll}><Icon name="external" /></button>}
          <button className="btn-icon" title="Copy a link to this folder" onClick={onShareFolder}><Icon name="share" /></button>
          {admin && <button className="btn-icon" title="Edit folder" onClick={onEditFolder}><Icon name="edit" /></button>}
          {admin && <button className="btn-icon danger" title="Delete folder" onClick={onDeleteFolder}><Icon name="trash" /></button>}
        </div>
      </header>

      {!collapsed && (
        links.length === 0 ? (
          <div className="folder-empty">
            {filtered ? "Nothing in this folder matches." : (
              <>
                This folder is empty.
                {canAdd && <button className="btn btn-secondary btn-sm" onClick={onAddHere}><Icon name="plus" /> Add the first website</button>}
                {admin && dragEnabled && <span className="hint">…or drag a website here.</span>}
              </>
            )}
          </div>
        ) : (
          <div className={`cards ${view === "list" ? "list" : ""}`}>
            {links.map((link) => (
              <LinkCard
                key={link.id}
                folder={folder}
                link={link}
                query={query}
                admin={admin}
                me={me}
                favorited={favorites.has(link.id)}
                myRating={myRatings[link.id]}
                avg={ratings[link.id]?.avg}
                ratingCount={ratings[link.id]?.count}
                actions={actions}
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
          </div>
        )
      )}
    </section>
  );
}
