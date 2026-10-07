"use client";
import { useCallback, useEffect, useState } from "react";
import { Club } from "@/lib/types";
import { Icon } from "./Icon";

type ClubRow = Club & { channel: string; memberCount: number; isMember: boolean; isOwner: boolean };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/clubs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

/** Browse, join, start and run clubs (each has a shared folder and a chat channel). */
export default function ClubsModal({ me, staff, onOpenChannel, onOpenFolder, onChanged, toast, onClose }: {
  me: string | null;
  staff: boolean;
  onOpenChannel: (channel: string) => void;
  onOpenFolder: (folderId: string) => void;
  /** clubs changed (refresh channels/folders) */
  onChanged: () => void;
  toast: (msg: string) => void;
  onClose: () => void;
}) {
  const [clubs, setClubs] = useState<ClubRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏷️");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState(true);
  const [managing, setManaging] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/clubs", { cache: "no-store" }).then((r) => r.json()).then((j) => setClubs(j.clubs || [])).catch(() => setClubs([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    try {
      await post(body);
      if (done) toast(done);
      load();
      onChanged();
      return true;
    } catch (e: any) {
      toast(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>🏷️ Clubs</h2>
        <p className="modal-text">A club is a group with its own folder (members can add to it) and its own chat channel. Moderators can see club channels too.</p>
        {!clubs && <div className="skeleton skel-row" />}
        {clubs && clubs.length === 0 && <div className="admin-empty">No clubs yet — start the first one!</div>}
        <div className="club-list">
          {clubs?.map((c) => (
            <div key={c.id} className="club">
              <div className="club-top">
                <span className="club-emoji">{c.emoji}</span>
                <div className="row-main">
                  <div className="row-title">{c.name}{!c.open && <span className="pill">invite only</span>}{c.isOwner && <span className="pill approved">yours</span>}</div>
                  <div className="row-sub">{c.description || "No description"} · {c.memberCount} member{c.memberCount === 1 ? "" : "s"} · run by {c.owner}</div>
                </div>
                <div className="club-actions">
                  {c.isMember || staff ? <button className="btn btn-secondary btn-sm" onClick={() => { onOpenChannel(c.channel); onClose(); }}><Icon name="chat" /> Chat</button> : null}
                  {c.folderId && <button className="btn btn-secondary btn-sm" onClick={() => { onOpenFolder(c.folderId!); onClose(); }}><Icon name="folder" /> Folder</button>}
                  {me && !c.isMember && c.open && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act({ action: "join", id: c.id }, `Joined ${c.name}`)}>Join</button>}
                  {me && c.isMember && !c.isOwner && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act({ action: "leave", id: c.id }, `Left ${c.name}`)}>Leave</button>}
                  {(c.isOwner || staff) && <button className="btn-icon" title="Manage" onClick={() => setManaging(managing === c.id ? null : c.id)}><Icon name="settings" /></button>}
                </div>
              </div>
              {managing === c.id && (
                <div className="club-manage">
                  <div className="chip-grid">
                    {c.members.map((m) => (
                      <span key={m} className="pick">
                        {m}{m === c.owner ? " 👑" : ""}
                        {m !== c.owner && <button className="ss-x" title={`Remove ${m}`} onClick={() => act({ action: "remove", id: c.id, username: m }, `Removed ${m}`)}>×</button>}
                      </span>
                    ))}
                  </div>
                  <form className="ms-add" onSubmit={async (e) => { e.preventDefault(); if (addName.trim() && (await act({ action: "add", id: c.id, username: addName.trim() }, `Added ${addName.trim()}`))) setAddName(""); }}>
                    <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Add someone by username" />
                    <button className="btn btn-secondary btn-sm" disabled={busy}>Add</button>
                  </form>
                  <div className="club-manage-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => act({ action: "edit", id: c.id, patch: { open: !c.open } }, c.open ? "Now invite-only" : "Now anyone can join")}>
                      {c.open ? "Make invite-only" : "Let anyone join"}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Delete ${c.name}? Its channel goes away; its folder is archived.`)) act({ action: "delete", id: c.id }, `Deleted ${c.name}`); }}>Delete club</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {me && (creating ? (
          <form className="club-create" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "create", name, emoji, description: desc, open }, `Started ${name}!`)) { setCreating(false); setName(""); setDesc(""); } }}>
            <div className="admin-h">Start a club</div>
            <div className="status-row">
              <input className="emoji-in" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Club emoji" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Club name, e.g. Coding Club" maxLength={30} required />
            </div>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's it about? (optional)" maxLength={200} />
            <label className="check remember"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Anyone can join</label>
            <div className="row-edit-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={busy || name.trim().length < 2}>Start club</button>
            </div>
          </form>
        ) : (
          <button className="btn btn-secondary mt" onClick={() => setCreating(true)}><Icon name="plus" /> Start a club</button>
        ))}
        <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
