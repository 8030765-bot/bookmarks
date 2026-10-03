"use client";
import { useState } from "react";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import LinkCard, { Highlight } from "./LinkCard";
import { useCardEnv } from "./cardEnv";
import type { LinkRef } from "./ui";

export type Drag = { kind: "link"; folderId: string; linkId: string } | { kind: "folder"; folderId: string } | null;

/** A link dragged in from another tab or the address bar. */
function droppedUrl(e: React.DragEvent): string {
  const uri = e.dataTransfer.getData("text/uri-list").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  return uri || e.dataTransfer.getData("text/plain").trim();
}
const carriesUrl = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("text/uri-list");

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
  onToggleView,
  onAddHere,
  onOpenAll,
  onEditFolder,
  onDeleteFolder,
  onShareFolder,
  onMoveLink,
  onMoveFolder,
  onDropUrl,
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
  onToggleView: () => void;
  onAddHere: () => void;
  onOpenAll: () => void;
  onEditFolder: () => void;
  onDeleteFolder: () => void;
  onShareFolder: () => void;
  onMoveLink: (from: { folderId: string; linkId: string }, toFolderId: string, beforeLinkId: string | null) => void;
  onMoveFolder: (folderId: string, beforeFolderId: string) => void;
  onDropUrl: (folderId: string, url: string) => void;
}) {
  const { admin, query } = useCardEnv();
  const [urlOver, setUrlOver] = useState(false);
  const filtered = links.length !== totalLinks;
  const linkDragging = drag?.kind === "link";
  const folderDragging = drag?.kind === "folder" && drag.folderId !== folder.id;
  const isFolderDrop = dropTarget === `folder:${folder.id}`;
  const isEndDrop = dropTarget === `end:${folder.id}`;
  const count = links.length + shortcuts.length;

  return (
    <section
      id={`folder-${folder.id}`}
      className={`folder-card ${folder.pinned ? "pinned" : ""} ${isEndDrop || urlOver ? "drop-into" : ""}`}
      style={folder.color ? ({ "--folder-accent": folder.color } as React.CSSProperties) : undefined}
      onDragOver={(e) => {
        if (!drag && canAdd && carriesUrl(e)) {
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
          <button className="btn-icon" title={view === "grid" ? "Show this folder as a list" : "Show this folder as a grid"} onClick={onToggleView}>
            <Icon name={view === "grid" ? "list" : "grid"} />
          </button>
          {canAdd && <button className="btn-icon" title={`Add a website to ${folder.name}`} onClick={onAddHere}><Icon name="plus" /></button>}
          {links.length > 0 && <button className="btn-icon" title="Open all in new tabs" onClick={onOpenAll}><Icon name="external" /></button>}
          <button className="btn-icon" title="Copy a link to this folder" onClick={onShareFolder}><Icon name="share" /></button>
          {admin && <button className="btn-icon" title="Edit folder" onClick={onEditFolder}><Icon name="edit" /></button>}
          {admin && <button className="btn-icon danger" title="Delete folder" onClick={onDeleteFolder}><Icon name="trash" /></button>}
        </div>
      </header>

      {urlOver && <div className="url-drop-hint"><Icon name="plus" /> Drop to add this link to {folder.emoji} {folder.name}</div>}
      {!collapsed && (
        count === 0 ? (
          <div className="folder-empty">
            {filtered ? "Nothing in this folder matches." : (
              <>
                This folder is empty.
                {canAdd && <button className="btn btn-secondary btn-sm" onClick={onAddHere}><Icon name="plus" /> Add the first website</button>}
                {canAdd && <span className="hint">…or drag a link here from another tab.</span>}
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
        )
      )}
    </section>
  );
}
