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
  description: string;
  guide: string;
  parentId: string;
  space: string;
  rule: string;
  sort: string;
  maintainers: string[];
}

const SORT_OPTIONS: [string, string][] = [["manual", "Folder order (drag to arrange)"], ["name", "A–Z"], ["newest", "Newest first"], ["clicks", "Most visited"], ["rating", "Top rated"]];

export function FolderModal({
  folder,
  folders,
  spaces,
  admin,
  smart,
  submitting,
  onSubmit,
  onClose,
}: {
  folder?: Folder;
  /** every folder, for "put it inside…" */
  folders: Folder[];
  /** spaces already in use, offered as suggestions */
  spaces: string[];
  admin: boolean;
  /** creating a smart folder */
  smart?: boolean;
  submitting: boolean;
  onSubmit: (v: FolderValues) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(folder?.name || "");
  const [emoji, setEmoji] = useState(folder?.emoji || (smart ? "✨" : "📁"));
  const [color, setColor] = useState(folder?.color || COLORS[0]);
  const [pinned, setPinned] = useState(!!folder?.pinned);
  const [description, setDescription] = useState(folder?.description || "");
  const [guide, setGuide] = useState(folder?.guide || "");
  const [parentId, setParentId] = useState(folder?.parentId || "");
  const [space, setSpace] = useState(folder?.space || "");
  const [rule, setRule] = useState(folder?.rule || "");
  const [sort, setSort] = useState<string>(folder?.sort || "manual");
  const [maintainers, setMaintainers] = useState((folder?.maintainers || []).join(", "));
  const [more, setMore] = useState(!!(folder?.description || folder?.guide || folder?.parentId || folder?.space || folder?.sort || folder?.maintainers || smart));
  const isSmart = smart || !!folder?.rule;
  // a folder with sub-folders can't itself go inside another (one level only)
  const hasChildren = !!folder && folders.some((f) => f.parentId === folder.id);
  const parents = folders.filter((f) => !f.parentId && f.id !== folder?.id && !f.rule);
  const canMove = admin || !folder;

  return (
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{folder ? "Edit folder" : isSmart ? "New smart folder" : "New folder"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await onSubmit({
              name: name.trim(), emoji: emoji.trim() || "📁", color, pinned, description, guide, parentId, space: space.trim(),
              rule: isSmart ? rule.trim() : "", sort,
              maintainers: maintainers.split(/[\s,]+/).map((u) => u.replace(/^@/, "").trim()).filter(Boolean),
            });
            if (ok) onClose();
          }}
        >
          <div className="folder-preview" style={{ "--folder-accent": color } as React.CSSProperties}>
            <span className="fh-emoji">{emoji || "📁"}</span>
            <span className="fh-name">{name || "Folder name"}</span>
            {pinned && <span className="fh-pin"><Icon name="pin" /></span>}
            {isSmart && <span className="pill smart">smart</span>}
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isSmart ? "e.g. All science" : "e.g. Maths games"} required autoFocus maxLength={60} />
          </div>
          {isSmart && (
            <div className="form-group">
              <label>Show every website matching</label>
              <input value={rule} onChange={(e) => setRule(e.target.value)} placeholder="e.g. tag:science   or   site:youtube.com   or   rating:4+" required={!!smart} maxLength={200} />
              <div className="hint">Uses the same words as search: tag:, in:, by:, site:, is:new, rating:4+, -word, &quot;exact phrase&quot;.</div>
            </div>
          )}
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
          <button type="button" className="more-toggle" onClick={() => setMore(!more)}>
            <span className={`chev ${more ? "open" : ""}`}><Icon name="down" /></span> Description, guide & more
          </button>
          {more && (
            <>
              <div className="form-group">
                <label>Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line about what's in here" maxLength={300} />
              </div>
              <div className="form-group">
                <label>Guide (optional)</label>
                <textarea value={guide} onChange={(e) => setGuide(e.target.value)} maxLength={5000} placeholder={"A longer write-up. Simple formatting works:\n# Heading\n- bullet points\n**bold**, *italic*, [link](https://…)"} />
              </div>
              {canMove && !isSmart && (
                <div className="form-group">
                  <label>Put it inside</label>
                  <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={hasChildren}>
                    <option value="">Nowhere — a main folder</option>
                    {parents.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                  </select>
                  {hasChildren && <div className="hint">This folder has sub-folders of its own, so it stays a main folder.</div>}
                </div>
              )}
              <div className="form-group">
                <label>Default order of websites</label>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {admin && (
                <>
                  <div className="form-group">
                    <label>Space (tab at the top)</label>
                    <input value={space} onChange={(e) => setSpace(e.target.value)} placeholder="e.g. School, Fun — leave empty for none" maxLength={30} list="space-list" />
                    <datalist id="space-list">{spaces.map((s) => <option key={s} value={s} />)}</datalist>
                  </div>
                  {folder && (
                    <div className="form-group">
                      <label>Maintainers</label>
                      <input value={maintainers} onChange={(e) => setMaintainers(e.target.value)} placeholder="usernames, separated by commas" />
                      <div className="hint">They can add, edit and remove websites in just this folder (up to 5 people).</div>
                    </div>
                  )}
                </>
              )}
            </>
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

/** Ask for one piece of text (a note, a new name…). */
export function PromptModal({
  title,
  initial,
  multiline,
  placeholder,
  onSave,
  onClose,
}: {
  title: string;
  initial: string;
  multiline?: boolean;
  placeholder?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const save = (e: React.FormEvent) => { e.preventDefault(); onSave(value); onClose(); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={save}>
          <div className="form-group">
            {multiline ? (
              <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={500} autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(e); }} />
            ) : (
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={100} autoFocus onFocus={(e) => e.target.select()} />
            )}
          </div>
          <div className="modal-actions">
            {initial && <button type="button" className="btn btn-secondary" onClick={() => { onSave(""); onClose(); }}>Clear</button>}
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
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
  ["O", "Tools drawer"],
  ["Shift T", "Focus timer"],
  ["Esc", "Close / clear search"],
  ["?", "This list"],
  ["Ctrl V", "Paste a link anywhere to add it"],
];
const CARD_SHORTCUTS: [string, string][] = [
  ["J / K", "Move to the next / previous website"],
  ["Enter", "Open it"],
  ["F", "Favorite"],
  ["1 – 5", "Rate it"],
  ["B", "Read later"],
  ["D", "Mark done"],
  ["I", "Details"],
  ["Space", "Select (for copying or moving several)"],
  ["Ctrl-click", "Open in a background tab"],
  ["Right-click", "More options"],
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
        <div className="admin-h">On a website (after pressing J)</div>
        <div className="shortcut-list">
          {CARD_SHORTCUTS.map(([k, label]) => (
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
