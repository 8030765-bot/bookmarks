"use client";
import { useState } from "react";
import { Folder } from "@/lib/types";
import { Icon } from "./Icon";
import type { LinkRef } from "./ui";

/** Shows up when you tick one or more cards: act on all of them at once. */
export default function SelectionBar({
  refs,
  folders,
  admin,
  onCopy,
  onOpenAll,
  onFavorite,
  onLater,
  onMove,
  onTag,
  onDelete,
  onClear,
}: {
  refs: LinkRef[];
  folders: Folder[];
  admin: boolean;
  onCopy: (format: "lines" | "markdown") => void;
  onOpenAll: () => void;
  onFavorite: () => void;
  onLater: () => void;
  onMove: (folderId: string) => void;
  onTag: (tag: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [tag, setTag] = useState("");
  if (!refs.length) return null;
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected websites">
      <strong>{refs.length} selected</strong>
      <button className="btn btn-secondary btn-sm" onClick={() => onCopy("lines")} title="Copy every link, one per line"><Icon name="copy" /> Copy</button>
      <button className="btn btn-secondary btn-sm" onClick={() => onCopy("markdown")} title="Copy as a Markdown list"><Icon name="link" /> Markdown</button>
      <button className="btn btn-secondary btn-sm" onClick={onOpenAll}><Icon name="external" /> Open all</button>
      <button className="btn btn-secondary btn-sm" onClick={onFavorite}><Icon name="star" /> Favorite</button>
      <button className="btn btn-secondary btn-sm" onClick={onLater}><Icon name="clock" /> Read later</button>
      {admin && (
        <>
          <select
            value=""
            onChange={(e) => { if (e.target.value) onMove(e.target.value); }}
            aria-label="Move selected to a folder"
          >
            <option value="">Move to…</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
          </select>
          <form className="sel-tag" onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { onTag(tag.trim()); setTag(""); } }}>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ tag" aria-label="Tag selected" maxLength={24} />
          </form>
          <button className="btn btn-danger btn-sm" onClick={onDelete}><Icon name="trash" /> Delete</button>
        </>
      )}
      <button className="btn-icon" onClick={onClear} title="Clear selection (Esc)"><Icon name="x" /></button>
    </div>
  );
}
