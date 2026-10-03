"use client";
import { useMemo, useState } from "react";
import { BookmarksData, Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { COLORS, hostOf, nameFromUrl, normUrl } from "./ui";

export interface LinkValues {
  name: string;
  url: string;
  folderId: string;
  tags: string[];
  color: string;
  notes: string;
}

export type LinkModalMode = { kind: "add"; folderId?: string } | { kind: "edit"; folder: Folder; link: Link };

export default function LinkModal({
  mode,
  data,
  submitting,
  canCreateFolder,
  onSubmit,
  onCreateFolder,
  onClose,
}: {
  mode: LinkModalMode;
  data: BookmarksData;
  submitting: boolean;
  canCreateFolder: boolean;
  onSubmit: (values: LinkValues) => Promise<boolean>;
  onCreateFolder: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.link : null;
  const [url, setUrl] = useState(editing?.url || "");
  const [name, setName] = useState(editing?.name || "");
  const [nameTouched, setNameTouched] = useState(!!editing);
  const [folderId, setFolderId] = useState(
    mode.kind === "edit" ? mode.folder.id : mode.folderId || data.folders[0]?.id || ""
  );
  const [tags, setTags] = useState<string[]>(editing?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [color, setColor] = useState(editing?.color || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [showMore, setShowMore] = useState(!!(editing?.notes || editing?.color));
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    data.folders.forEach((f) => f.links.forEach((l) => l.tags?.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))));
    return Array.from(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [data]);
  const tagSuggestions = allTags
    .filter((t) => !tags.includes(t) && (!tagInput || t.toLowerCase().includes(tagInput.toLowerCase())))
    .slice(0, 8);

  const duplicate = useMemo(() => {
    const n = normUrl(url);
    if (!n || n.length < 4) return null;
    for (const f of data.folders) {
      const l = f.links.find((x) => normUrl(x.url) === n && x.id !== editing?.id);
      if (l) return { folder: f, link: l };
    }
    return null;
  }, [url, data, editing]);

  const host = url.trim() ? hostOf(/^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : "";

  function onUrlChange(value: string) {
    setUrl(value);
    if (!nameTouched) setName(nameFromUrl(value));
  }
  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/,/g, "").slice(0, 24);
    if (t && !tags.includes(t) && tags.length < 8) setTags([...tags, t]);
    setTagInput("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let target = folderId;
    if (newFolder !== null) {
      if (!newFolder.trim()) return;
      const id = await onCreateFolder(newFolder.trim());
      if (!id) return;
      target = id;
      setFolderId(id);
      setNewFolder(null);
    }
    const pendingTag = tagInput.trim();
    const ok = await onSubmit({
      name: name.trim(),
      url: url.trim(),
      folderId: target,
      tags: pendingTag ? [...tags, pendingTag.toLowerCase()] : tags,
      color,
      notes,
    });
    if (ok) onClose();
  }

  return (
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="modal wide link-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? "Edit website" : "Add a website"}</h2>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Link</label>
            <div className="url-field">
              <span className="url-favicon">
                {host ? <Favicon key={host} url={`https://${host}`} name={host} size={18} /> : <Icon name="link" />}
              </span>
              <input
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="Paste a link, e.g. coolmathgames.com"
                required
                autoFocus={!editing}
                inputMode="url"
              />
            </div>
            {duplicate && (
              <div className="field-warn">
                Already on the site as <strong>{duplicate.link.name}</strong> in {duplicate.folder.emoji} {duplicate.folder.name}.
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              placeholder="What should it be called?"
              required
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label>Folder</label>
            <div className="chip-grid">
              {data.folders.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  className={`pick ${newFolder === null && folderId === f.id ? "on" : ""}`}
                  onClick={() => { setFolderId(f.id); setNewFolder(null); }}
                >
                  <span>{f.emoji}</span> {f.name}
                </button>
              ))}
              {canCreateFolder && (
                <button type="button" className={`pick dashed ${newFolder !== null ? "on" : ""}`} onClick={() => setNewFolder(newFolder ?? "")}>
                  <Icon name="plus" /> New folder
                </button>
              )}
            </div>
            {newFolder !== null && (
              <input
                className="mt"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="New folder name"
                autoFocus
                required
                maxLength={60}
              />
            )}
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tag-input">
              {tags.map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                  <button type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                  if (e.key === "Backspace" && !tagInput && tags.length) setTags(tags.slice(0, -1));
                }}
                placeholder={tags.length ? "" : "Type a tag and press Enter"}
              />
            </div>
            {tagSuggestions.length > 0 && (
              <div className="tag-suggest">
                {tagSuggestions.map((t) => (
                  <button type="button" key={t} onClick={() => addTag(t)}>+ {t}</button>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="more-toggle" onClick={() => setShowMore(!showMore)}>
            <span className={`chev ${showMore ? "open" : ""}`}><Icon name="down" /></span> Color & notes
          </button>
          {showMore && (
            <>
              <div className="form-group">
                <label>Accent color</label>
                <div className="swatches">
                  <button type="button" className={`swatch none ${!color ? "on" : ""}`} onClick={() => setColor("")} title="No color">×</button>
                  {COLORS.map((c) => (
                    <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title={c} />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything people should know about this site" maxLength={500} />
              </div>
            </>
          )}

          <div className="preview">
            <span className="preview-label">Preview</span>
            <div className="card static" style={color ? ({ "--card-accent": color } as React.CSSProperties) : undefined}>
              <span className="card-main">
                <span className="card-icon">
                  <Favicon key={host} url={host ? `https://${host}` : ""} name={name || "?"} size={22} />
                </span>
                <span className="card-body">
                  <span className="card-name">{name || "Website name"}{!editing && <span className="badge-new">New</span>}</span>
                  <span className="card-host">{host || "example.com"}</span>
                </span>
              </span>
              {(tags.length > 0 || notes) && (
                <div className="card-meta">
                  {tags.map((t) => <span key={t} className="tag">{t}</span>)}
                  {notes && <span className="meta-note">📝 note</span>}
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !url.trim() || !name.trim()}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Add for everyone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
