"use client";
import { useState } from "react";
import { Folder } from "@/lib/types";
import { Icon } from "./Icon";
import { COLORS, FOLDER_EMOJIS } from "./ui";

export interface FolderValues {
  name: string;
  emoji: string;
  color: string;
  pinned: boolean;
}

export function FolderModal({
  folder,
  admin,
  submitting,
  onSubmit,
  onClose,
}: {
  folder?: Folder;
  admin: boolean;
  submitting: boolean;
  onSubmit: (v: FolderValues) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(folder?.name || "");
  const [emoji, setEmoji] = useState(folder?.emoji || "📁");
  const [color, setColor] = useState(folder?.color || COLORS[0]);
  const [pinned, setPinned] = useState(!!folder?.pinned);

  return (
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{folder ? "Edit folder" : "New folder"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSubmit({ name: name.trim(), emoji: emoji.trim() || "📁", color, pinned })) onClose();
          }}
        >
          <div className="folder-preview" style={{ "--folder-accent": color } as React.CSSProperties}>
            <span className="fh-emoji">{emoji || "📁"}</span>
            <span className="fh-name">{name || "Folder name"}</span>
            {pinned && <span className="fh-pin"><Icon name="pin" /></span>}
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maths games" required autoFocus maxLength={60} />
          </div>
          <div className="form-group">
            <label>Icon</label>
            <div className="emoji-grid">
              {FOLDER_EMOJIS.map((em) => (
                <button type="button" key={em} className={emoji === em ? "on" : ""} onClick={() => setEmoji(em)}>{em}</button>
              ))}
              <input
                className="emoji-custom"
                value={FOLDER_EMOJIS.includes(emoji) ? "" : emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="Other"
                maxLength={4}
                aria-label="Custom emoji"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="swatches">
              {COLORS.map((c) => (
                <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title={c} />
              ))}
            </div>
          </div>
          {admin && folder && (
            <label className="toggle-row compact">
              <div><strong>Pin to top</strong><span>Pinned folders always show first.</span></div>
              <input type="checkbox" role="switch" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? "Saving…" : folder ? "Save changes" : "Create folder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  submitting,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  submitting: boolean;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="modal-text">{body}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting} autoFocus>Cancel</button>
          <button className="btn btn-danger" disabled={submitting} onClick={async () => { if (await onConfirm()) onClose(); }}>
            {submitting ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "Command menu"],
  ["/", "Search"],
  ["N", "Add a website"],
  ["F", "New folder"],
  ["R", "Open a random website"],
  ["S", "Spin the wheel"],
  ["L", "Community & leaderboard"],
  ["W", "What's new"],
  ["P", "Customize the look"],
  ["C", "Open or close chat"],
  ["G", "Grid / list view"],
  ["X", "Collapse / expand all folders"],
  ["Enter", "Open the top search result"],
  ["T", "Light / dark theme"],
  ["Esc", "Close / clear search"],
  ["?", "This list"],
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <div className="shortcut-list">
          {SHORTCUTS.map(([k, label]) => (
            <div key={k} className="shortcut-row">
              <span>{label}</span>
              <span className="kbd">{k}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>
  );
}
