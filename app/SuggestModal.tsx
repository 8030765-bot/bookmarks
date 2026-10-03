"use client";
import { useCallback, useEffect, useState } from "react";
import { BookmarksData, Suggestion, SuggestionKind } from "@/lib/types";
import { suggestionSummary } from "./components/ui";
import { useOnRevChange } from "./components/sync";

export interface SuggestStart {
  kind?: SuggestionKind;
  folderId?: string;
  linkId?: string;
}

const KIND_LABELS: Record<SuggestionKind, string> = {
  addLink: "Add a website",
  editLink: "Change a website",
  removeLink: "Remove a website",
  newFolder: "New folder",
  editFolder: "Change a folder",
  other: "Idea for the site",
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export { suggestionSummary };

export default function SuggestModal({
  data,
  user,
  start,
  onClose,
  onNeedLogin,
  showToast,
}: {
  data: BookmarksData;
  user: string | null;
  start: SuggestStart;
  onClose: () => void;
  onNeedLogin: () => void;
  showToast: (msg: string) => void;
}) {
  const [view, setView] = useState<"form" | "mine">("form");
  const [kind, setKind] = useState<SuggestionKind>(start.kind || "addLink");
  const [target, setTarget] = useState(start.folderId && start.linkId ? `${start.folderId}::${start.linkId}` : "");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState(start.folderId || data.folders[0]?.id || "");
  const [note, setNote] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<Suggestion[]>([]);

  const [targetFolderId, targetLinkId] = target.split("::");
  const targetLink = data.folders.find((f) => f.id === targetFolderId)?.links.find((l) => l.id === targetLinkId);

  // prefill the "change" fields with the current values of the chosen link
  useEffect(() => {
    if (kind === "editLink" && targetLink) {
      setName(targetLink.name);
      setUrl(targetLink.url);
    } else if (kind === "editFolder") {
      const f = data.folders.find((x) => x.id === folderId);
      setName(f?.name || "");
      setDescription(f?.description || "");
    } else if (kind !== "editLink") {
      setName("");
      setUrl("");
      setDescription("");
    }
    // only when the chosen link or kind changes, not on every keystroke
  }, [kind, target, folderId]);

  const loadMine = useCallback(async () => {
    const res = await fetch("/api/suggestions", { cache: "no-store" }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (Array.isArray(json?.suggestions)) setMine(json.suggestions);
  }, []);
  useEffect(() => { if (user) loadMine(); }, [user, loadMine]);
  useOnRevChange("suggestions", () => { if (user) loadMine(); });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { onNeedLogin(); return; }
    setSending(true);
    try {
      const body: Record<string, string> = { kind, note };
      if (kind === "addLink") Object.assign(body, { name, url, folderId });
      if (kind === "editLink") Object.assign(body, { folderId: targetFolderId, linkId: targetLinkId, name, url });
      if (kind === "removeLink") Object.assign(body, { folderId: targetFolderId, linkId: targetLinkId });
      if (kind === "newFolder") Object.assign(body, { name, emoji, description });
      if (kind === "editFolder") Object.assign(body, { folderId, name, description });
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not send");
      setMine(json.suggestions);
      setName(""); setUrl(""); setNote("");
      setView("mine");
      showToast("Thanks! An admin will review it.");
    } catch (err: any) {
      showToast(err.message || "Could not send");
    } finally {
      setSending(false);
    }
  }

  const pendingMine = mine.filter((s) => s.status === "pending").length;

  return (
    <div className="modal-overlay" onClick={() => !sending && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>💡 Suggest a change</h2>
        <div className="auth-tabs">
          <button type="button" className={view === "form" ? "on" : ""} onClick={() => setView("form")}>New suggestion</button>
          <button type="button" className={view === "mine" ? "on" : ""} onClick={() => setView("mine")}>
            My suggestions{pendingMine ? ` (${pendingMine} waiting)` : ""}
          </button>
        </div>

        {!user && (
          <div className="suggest-login">
            You need an account so the admin knows who suggested what.
            <button className="btn btn-primary btn-sm" onClick={onNeedLogin}>Log in or sign up</button>
          </div>
        )}

        {user && view === "form" && (
          <form onSubmit={submit}>
            <div className="kind-picker">
              {(Object.keys(KIND_LABELS) as SuggestionKind[]).map((k) => (
                <button type="button" key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            {kind === "addLink" && (
              <>
                <div className="form-group">
                  <label>Website name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cool Site" required maxLength={100} />
                </div>
                <div className="form-group">
                  <label>URL</label>
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" required />
                </div>
                <div className="form-group">
                  <label>Which folder?</label>
                  <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                    {data.folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {kind === "newFolder" && (
              <>
                <div className="form-group">
                  <label>Folder name</label>
                  <div className="status-row">
                    <input className="emoji-in" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" />
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Typing practice" required maxLength={60} />
                  </div>
                </div>
                <div className="form-group">
                  <label>What would go in it?</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="One line" />
                </div>
              </>
            )}
            {kind === "editFolder" && (
              <>
                <div className="form-group">
                  <label>Which folder?</label>
                  <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                    {data.folders.filter((f) => !f.rule).map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>New name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                </div>
                <div className="form-group">
                  <label>New description</label>
                  <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
                </div>
              </>
            )}

            {(kind === "editLink" || kind === "removeLink") && (
              <div className="form-group">
                <label>Which website?</label>
                <select value={target} onChange={(e) => setTarget(e.target.value)} required>
                  <option value="" disabled>Pick a website…</option>
                  {data.folders.map((f) => (
                    <optgroup key={f.id} label={`${f.emoji} ${f.name}`}>
                      {f.links.map((l) => <option key={l.id} value={`${f.id}::${l.id}`}>{l.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {kind === "editLink" && targetLink && (
              <>
                <div className="form-group">
                  <label>New name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
                </div>
                <div className="form-group">
                  <label>New URL</label>
                  <input value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
              </>
            )}

            <div className="form-group">
              <label>{kind === "other" ? "Your idea" : kind === "removeLink" ? "Why should it go? (optional)" : "Anything else? (optional)"}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                required={kind === "other"}
                placeholder={kind === "other" ? "e.g. add a folder for maths sites" : kind === "removeLink" ? "e.g. the link is broken" : ""}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? "Sending…" : "Send suggestion"}</button>
            </div>
          </form>
        )}

        {user && view === "mine" && (
          <>
            <div className="suggest-list">
              {mine.length === 0 && <div className="admin-empty">You haven&apos;t suggested anything yet.</div>}
              {mine.map((s) => (
                <div key={s.id} className="suggest-item">
                  <div className="suggest-item-top">
                    <span className="suggest-kind">{KIND_LABELS[s.kind]}</span>
                    <span className={`pill ${s.status}`}>{s.status === "rejected" ? "declined" : s.status}</span>
                    <span className="suggest-time">{timeAgo(s.resolvedAt || s.createdAt)}</span>
                  </div>
                  <div className="suggest-summary">{suggestionSummary(s)}</div>
                  {s.resolvedNote && <div className="suggest-reply">Admin: {s.resolvedNote}</div>}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
