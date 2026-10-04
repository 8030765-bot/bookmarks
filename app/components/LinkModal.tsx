"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarksData, Folder, Link, LinkStatus } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { COLORS, hostOf, nameFromUrl, normUrl, urlsIn } from "./ui";

export interface LinkValues {
  name: string;
  url: string;
  folderId: string;
  tags: string[];
  color: string;
  notes: string;
  emoji: string;
  tip: string;
  lang: string;
  cost: string;
  mobile: boolean;
  checklist: string[];
  related: { name: string; url: string }[];
  readMins?: number;
  // admin only
  pinned: boolean;
  verified: boolean;
  sticker: string;
  status: string;
  keyword: string;
  expiresAt: string;
  alsoIn: string[];
}

export type LinkModalMode =
  | { kind: "add"; folderId?: string; url?: string; bulk?: string }
  | { kind: "edit"; folder: Folder; link: Link };

const COLOR_NAMES: Record<string, string> = {
  "#7c6cff": "Purple", "#3dd68c": "Green", "#ffb84d": "Orange", "#ff5c7a": "Red", "#4dabff": "Blue", "#e879f9": "Pink", "#2dd4bf": "Teal", "#a3a3a3": "Grey",
};
const LANGS: [string, string][] = [["", "—"], ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["zh", "Chinese"], ["ja", "Japanese"], ["ar", "Arabic"], ["hi", "Hindi"]];
const STATUSES: [string, string][] = [["", "Not set"], ["works", "Works"], ["login", "Needs login"], ["slow", "Slow"], ["broken", "Broken"]];
const STICKERS: [string, string][] = [["", "None"], ["hot", "🔥 Hot"], ["new", "🆕 New"], ["essential", "⭐ Essential"]];

/** "Name | link" or just a link on each line. */
function parseBulk(text: string): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const [a, b] = t.split("|").map((s) => s.trim());
    if (b) { out.push({ name: a, url: b }); continue; }
    for (const url of urlsIn(t)) out.push({ name: nameFromUrl(url), url });
  }
  return out;
}

export default function LinkModal({
  mode,
  data,
  submitting,
  canCreateFolder,
  admin,
  canFetch,
  onSubmit,
  onBulk,
  onCreateFolder,
  onClose,
}: {
  mode: LinkModalMode;
  data: BookmarksData;
  submitting: boolean;
  canCreateFolder: boolean;
  admin: boolean;
  /** logged in, so we can look up the site's title */
  canFetch: boolean;
  onSubmit: (values: LinkValues) => Promise<boolean>;
  onBulk: (folderId: string, links: { name: string; url: string }[], tags: string[]) => Promise<boolean>;
  onCreateFolder: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const editing = mode.kind === "edit" ? mode.link : null;
  const [bulk, setBulk] = useState<string | null>(mode.kind === "add" && mode.bulk ? mode.bulk : null);
  const [bulkNaming, setBulkNaming] = useState(false);
  const [url, setUrl] = useState(editing?.url || (mode.kind === "add" ? mode.url || "" : ""));
  const [name, setName] = useState(editing?.name || (mode.kind === "add" && mode.url ? nameFromUrl(mode.url) : ""));
  const [nameTouched, setNameTouched] = useState(!!editing);
  const [folderId, setFolderId] = useState(
    mode.kind === "edit" ? mode.folder.id : mode.folderId || data.folders[0]?.id || ""
  );
  const [tags, setTags] = useState<string[]>(editing?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [color, setColor] = useState(editing?.color || "");
  const [notes, setNotes] = useState(editing?.notes || "");
  const [emoji, setEmoji] = useState(editing?.emoji || "");
  const [tip, setTip] = useState(editing?.tip || "");
  const [lang, setLang] = useState(editing?.lang || "");
  const [cost, setCost] = useState<string>(editing?.cost || "");
  const [mobile, setMobile] = useState(!!editing?.mobile);
  const [checklist, setChecklist] = useState((editing?.checklist || []).join("\n"));
  const [related, setRelated] = useState((editing?.related || []).map((r) => `${r.name} | ${r.url}`).join("\n"));
  const [readMins, setReadMins] = useState<number | undefined>(editing?.readMins);
  const [pinned, setPinned] = useState(!!editing?.pinned);
  const [verified, setVerified] = useState(!!editing?.verified);
  const [sticker, setSticker] = useState<string>(editing?.sticker || "");
  const [status, setStatus] = useState<string>(editing?.status || "");
  const [keyword, setKeyword] = useState(editing?.keyword || "");
  const [expiresAt, setExpiresAt] = useState(editing?.expiresAt ? editing.expiresAt.slice(0, 10) : "");
  const [alsoIn, setAlsoIn] = useState<string[]>(editing?.alsoIn || []);
  const [showMore, setShowMore] = useState(!!(editing?.notes || editing?.color || editing?.emoji || editing?.tip || editing?.checklist || editing?.related));
  const [showAdmin, setShowAdmin] = useState(!!(editing?.pinned || editing?.verified || editing?.sticker || editing?.status || editing?.keyword || editing?.expiresAt || editing?.alsoIn));
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [lookup, setLookup] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const notesRef = useRef(notes);
  notesRef.current = notes;

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

  // look the page up for a proper title + description (adding only)
  useEffect(() => {
    if (editing || bulk !== null || !canFetch || !host.includes(".")) { setLookup("idle"); return; }
    const target = /^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    let live = true;
    const t = setTimeout(async () => {
      setLookup("busy");
      try {
        const res = await fetch(`/api/meta?url=${encodeURIComponent(target)}`);
        const j = await res.json();
        if (!live) return;
        if (!res.ok) { setLookup("fail"); return; }
        if (j.title && !nameTouched) setName(String(j.title).split(/\s[|–—-]\s/)[0].slice(0, 100));
        if (j.description && !notesRef.current) setNotes(String(j.description).slice(0, 500));
        if (j.readMins) setReadMins(j.readMins);
        setLookup("done");
      } catch {
        if (live) setLookup("fail");
      }
    }, 700);
    return () => { live = false; clearTimeout(t); };
  }, [url, host, editing, bulk, canFetch, nameTouched]);

  function onUrlChange(value: string) {
    // pasting several links at once switches to "add several"
    if (!editing && urlsIn(value).length > 1) { setBulk(value); return; }
    setUrl(value);
    if (!nameTouched) setName(nameFromUrl(value));
  }
  function addTag(raw: string) {
    const t = raw.trim().toLowerCase().replace(/,/g, "").slice(0, 24);
    if (t && !tags.includes(t) && tags.length < 8) setTags([...tags, t]);
    setTagInput("");
  }
  async function resolveFolder(): Promise<string | null> {
    if (newFolder === null) return folderId;
    if (!newFolder.trim()) return null;
    const id = await onCreateFolder(newFolder.trim());
    if (!id) return null;
    setFolderId(id);
    setNewFolder(null);
    return id;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = await resolveFolder();
    if (!target) return;
    const pendingTag = tagInput.trim();
    const allTagsNow = pendingTag ? [...tags, pendingTag.toLowerCase()] : tags;
    if (bulk !== null) {
      let items = parseBulk(bulk);
      // look up each page's real title (logged in, first 20) instead of guessing from the address
      if (canFetch && items.length <= 20) {
        setBulkNaming(true);
        items = await Promise.all(items.map(async (it) => {
          if (it.name !== nameFromUrl(it.url)) return it; // the list already gave it a name
          try {
            const res = await fetch(`/api/meta?url=${encodeURIComponent(it.url)}`);
            const j = res.ok ? await res.json() : null;
            return j?.title ? { ...it, name: String(j.title).slice(0, 100) } : it;
          } catch {
            return it;
          }
        }));
        setBulkNaming(false);
      }
      if (await onBulk(target, items, allTagsNow)) onClose();
      return;
    }
    const ok = await onSubmit({
      name: name.trim(),
      url: url.trim(),
      folderId: target,
      tags: allTagsNow,
      color,
      notes,
      emoji: emoji.trim(),
      tip: tip.trim(),
      lang,
      cost,
      mobile,
      checklist: checklist.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      related: parseBulk(related),
      readMins,
      pinned,
      verified,
      sticker,
      status,
      keyword: keyword.trim(),
      expiresAt,
      alsoIn,
    });
    if (ok) onClose();
  }

  const bulkLinks = bulk !== null ? parseBulk(bulk) : [];

  return (
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="modal wide link-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? "Edit website" : bulk !== null ? "Add several websites" : "Add a website"}</h2>
        <form onSubmit={submit}>
          {bulk !== null ? (
            <div className="form-group">
              <label>Links — one per line, or “Name | link”</label>
              <textarea className="bulk-input" value={bulk} onChange={(e) => setBulk(e.target.value)} autoFocus placeholder={"coolmathgames.com\nDesmos | https://www.desmos.com/calculator"} />
              <div className="hint">
                {bulkLinks.length} link{bulkLinks.length === 1 ? "" : "s"} found{bulkLinks.length > 50 ? " — only the first 50 will be added" : ""}. Links already on the site are skipped.{" "}
                <button type="button" className="link-btn" onClick={() => { setUrl(bulkLinks[0]?.url || ""); setName(bulkLinks[0]?.name || ""); setBulk(null); }}>Just add one</button>
              </div>
            </div>
          ) : (
            <>
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
                {lookup === "busy" && <div className="hint">Looking up the site…</div>}
                {lookup === "done" && <div className="hint">✓ Filled in from the site — change anything you like.</div>}
                {!editing && (
                  <button type="button" className="link-btn hint" onClick={() => setBulk(url)}>Add several at once</button>
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
            </>
          )}

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
              <input className="mt" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder name" autoFocus required maxLength={60} />
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

          {bulk === null && (
            <>
              <button type="button" className="more-toggle" onClick={() => setShowMore(!showMore)}>
                <span className={`chev ${showMore ? "open" : ""}`}><Icon name="down" /></span> Description, labels & extras
              </button>
              {showMore && (
                <>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What is this site for?" maxLength={500} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Emoji</label>
                      <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="e.g. 🧮" maxLength={8} />
                    </div>
                    <div className="form-group">
                      <label>Language</label>
                      <select value={lang} onChange={(e) => setLang(e.target.value)}>
                        {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Cost</label>
                      <select value={cost} onChange={(e) => setCost(e.target.value)}>
                        <option value="">—</option>
                        <option value="free">Free</option>
                        <option value="paid">Paid</option>
                        <option value="account">Needs account</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Tip for everyone</label>
                    <input value={tip} onChange={(e) => setTip(e.target.value)} placeholder="e.g. Sign in with Google first" maxLength={200} />
                  </div>
                  <label className="toggle-row compact">
                    <div><strong>Works on phones</strong><span>Shows a 📱 label.</span></div>
                    <input type="checkbox" role="switch" checked={mobile} onChange={(e) => setMobile(e.target.checked)} />
                    <span className="switch" aria-hidden="true" />
                  </label>
                  <div className="form-group mt">
                    <label>Color label</label>
                    <div className="swatches">
                      <button type="button" className={`swatch none ${!color ? "on" : ""}`} onClick={() => setColor("")} title="No color">×</button>
                      {COLORS.map((c) => (
                        <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title={COLOR_NAMES[c] || c} aria-label={COLOR_NAMES[c] || c} />
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Checklist steps (one per line)</label>
                    <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={"Make an account\nPick a level"} />
                  </div>
                  <div className="form-group">
                    <label>Goes with (one per line, “Name | link”)</label>
                    <textarea value={related} onChange={(e) => setRelated(e.target.value)} placeholder="Video guide | https://…" />
                  </div>
                </>
              )}
              {admin && (
                <>
                  <button type="button" className="more-toggle" onClick={() => setShowAdmin(!showAdmin)}>
                    <span className={`chev ${showAdmin ? "open" : ""}`}><Icon name="down" /></span> Admin options
                  </button>
                  {showAdmin && (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Status</label>
                          <select value={status} onChange={(e) => setStatus(e.target.value as LinkStatus | "")}>
                            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Sticker</label>
                          <select value={sticker} onChange={(e) => setSticker(e.target.value)}>
                            {STICKERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Search keyword</label>
                          <input value={keyword} onChange={(e) => setKeyword(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="e.g. calc" maxLength={20} />
                          <div className="hint">Type it in search + Enter to open this.</div>
                        </div>
                        <div className="form-group">
                          <label>Hide after</label>
                          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                        </div>
                      </div>
                      <label className="toggle-row compact">
                        <div><strong>Pin to top of folder</strong><span>Shows first, with a pin.</span></div>
                        <input type="checkbox" role="switch" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                        <span className="switch" aria-hidden="true" />
                      </label>
                      <label className="toggle-row compact">
                        <div><strong>Verified</strong><span>You checked that it works and is OK.</span></div>
                        <input type="checkbox" role="switch" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
                        <span className="switch" aria-hidden="true" />
                      </label>
                      <div className="form-group mt">
                        <label>Also show in</label>
                        <div className="chip-grid">
                          {data.folders.filter((f) => f.id !== folderId).map((f) => (
                            <button type="button" key={f.id} className={`pick ${alsoIn.includes(f.id) ? "on" : ""}`}
                              onClick={() => setAlsoIn(alsoIn.includes(f.id) ? alsoIn.filter((x) => x !== f.id) : [...alsoIn, f.id].slice(0, 5))}>
                              <span>{f.emoji}</span> {f.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="preview">
                <span className="preview-label">Preview</span>
                <div className="card static" style={color ? ({ "--card-accent": color } as React.CSSProperties) : undefined}>
                  <span className="card-main">
                    <span className="card-icon">
                      <Favicon key={host} url={host ? `https://${host}` : ""} name={name || "?"} size={22} />
                      {emoji && <span className="card-emoji">{emoji}</span>}
                    </span>
                    <span className="card-body">
                      <span className="card-name">{name || "Website name"}{!editing && <span className="badge-new">New</span>}</span>
                      <span className="card-host">{host || "example.com"}{readMins ? ` · ${readMins} min read` : ""}</span>
                    </span>
                  </span>
                  {(tags.length > 0 || notes || tip) && (
                    <div className="card-meta">
                      {tags.map((t) => <span key={t} className="tag">{t}</span>)}
                      {notes && <span className="meta-note">📝 note</span>}
                      {tip && <span className="meta-tip">💡 tip</span>}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || bulkNaming || (bulk !== null ? !bulkLinks.length : !url.trim() || !name.trim())}>
              {bulkNaming ? "Finding names…" : submitting ? "Saving…" : editing ? "Save changes" : bulk !== null ? `Add ${Math.min(50, bulkLinks.length)} for everyone` : "Add for everyone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
