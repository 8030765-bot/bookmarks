"use client";
import { useMemo, useState } from "react";
import { Folder, Link } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { COST_LABEL, STATUS_LABEL, STICKER_LABEL, useCardEnv } from "./cardEnv";
import { ageLabel, hostOf, safeHref, timeAgo } from "./ui";
import { speak } from "./Fun";

/** The "back" of a card: everything about one link, plus your own notes and ticks. */
export default function LinkDetails({ link }: { folder: Folder; link: Link }) {
  const env = useCardEnv();
  const { actions } = env;
  const pref = env.prefs[link.id] || {};
  const [note, setNote] = useState(pref.note || "");
  const agg = env.ratings[link.id];
  const thanked = !!env.myThanks?.has(link.id);

  // links that share a tag or a website with this one
  const similar = useMemo(() => {
    const host = hostOf(link.url);
    const tags = new Set(link.tags || []);
    return env.allRefs
      .filter((r) => r.link.id !== link.id)
      .map((r) => ({ r, score: (r.link.tags || []).filter((t) => tags.has(t)).length * 2 + (hostOf(r.link.url) === host ? 3 : 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.r);
  }, [env.allRefs, link]);

  const labels = [
    link.status && STATUS_LABEL[link.status],
    link.cost && COST_LABEL[link.cost],
    link.lang && `Language: ${link.lang.toUpperCase()}`,
    link.mobile && "Works on phones",
    link.verified && "✓ Checked by an admin",
    link.sticker && STICKER_LABEL[link.sticker],
  ].filter(Boolean) as string[];
  const also = (link.alsoIn || []).map((id) => env.folderById.get(id)).filter((f): f is Folder => !!f);

  return (
    <div className="card-details" onClick={(e) => e.stopPropagation()}>
      {link.notes && <p className="cd-desc">{link.notes}</p>}
      {link.tip && <p className="cd-tip">💡 {link.tip}</p>}
      {link.communityNotes && link.communityNotes.length > 0 && (
        <div className="cd-notes">
          {link.communityNotes.map((n, i) => (
            <p key={i} className="cd-cnote"><Icon name="users" /> <span>{n.text}</span> <span className="muted-inline">— {n.by}</span></p>
          ))}
        </div>
      )}
      {labels.length > 0 && <div className="cd-labels">{labels.map((l) => <span key={l} className="label">{l}</span>)}</div>}

      <div className="cd-facts">
        {link.addedBy && <span>Added by <button className="link-btn" onClick={() => actions.openProfile(link.addedBy!)}>{link.addedBy}</button></span>}
        {link.createdAt && <span title={new Date(link.createdAt).toLocaleString()}>{link.addedBy ? "" : "Added "}{ageLabel(link.createdAt)}</span>}
        {link.updatedAt && <span>edited {timeAgo(link.updatedAt)}</span>}
        {link.readMins ? <span>{link.readMins} min read</span> : null}
        {link.expiresAt && <span>{new Date(link.expiresAt) < new Date() ? "expired" : "hides"} {new Date(link.expiresAt).toLocaleDateString()}</span>}
        {(link.clicks || 0) > 0 && <span>{link.clicks} visits</span>}
        {(env.thanks?.[link.id] || 0) > 0 && <span>🙏 {env.thanks![link.id]} thanks</span>}
      </div>

      {link.checklist && link.checklist.length > 0 && (
        <div className="cd-section">
          <div className="cd-h">Checklist</div>
          {link.checklist.map((step, i) => {
            const on = !!pref.checks?.includes(i);
            return (
              <label key={i} className={`cd-step ${on ? "on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => actions.pref(link.id, { checks: on ? (pref.checks || []).filter((x) => x !== i) : [...(pref.checks || []), i] })}
                />
                {step}
              </label>
            );
          })}
        </div>
      )}

      {link.related && link.related.length > 0 && (
        <div className="cd-section">
          <div className="cd-h">Goes with</div>
          {link.related.map((r) => (
            <a key={r.url} className="cd-link" href={safeHref(r.url)} target="_blank" rel="noopener noreferrer">
              <Favicon url={r.url} name={r.name} size={16} /> {r.name}
            </a>
          ))}
        </div>
      )}

      {agg && agg.count > 0 && (
        <div className="cd-section">
          <div className="cd-h">Ratings · {agg.avg}★ from {agg.count}</div>
          {[5, 4, 3, 2, 1].map((s) => {
            const n = agg.hist?.[s - 1] || 0;
            return (
              <div key={s} className="cd-bar">
                <span>{s}★</span>
                <span className="bar"><span style={{ width: `${agg.count ? (n / agg.count) * 100 : 0}%` }} /></span>
                <span className="bar-num">{n}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="cd-section">
        <div className="cd-h">Your private note <span className="muted-inline">— only you see this</span></div>
        <textarea
          className="cd-note"
          value={note}
          maxLength={500}
          placeholder="Write something for yourself…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note.trim() !== (pref.note || "")) { actions.pref(link.id, { note: note.trim() }); actions.toast(note.trim() ? "Note saved" : "Note removed"); } }}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>

      {(similar.length > 0 || also.length > 0) && (
        <div className="cd-section">
          {also.length > 0 && <div className="cd-h">Also in {also.map((f) => `${f.emoji} ${f.name}`).join(", ")}</div>}
          {similar.length > 0 && (
            <>
              <div className="cd-h">Similar</div>
              {similar.map(({ folder: f, link: l }) => (
                <a key={l.id} className="cd-link" href={safeHref(l.url)} target={actions.newTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => actions.open(f, l)}>
                  <Favicon url={l.url} name={l.name} size={16} /> {l.name} <span className="muted-inline">{f.emoji} {f.name}</span>
                </a>
              ))}
            </>
          )}
        </div>
      )}

      <div className="cd-actions">
        <button className="pick" title="Read the name and description out loud" onClick={() => {
          const text = [link.name, link.notes, link.tip, ...(link.communityNotes || []).map((n) => n.text)].filter(Boolean).join(". ");
          if (!speak(text)) actions.toast("Your device can't read aloud");
        }}>🔊 Read aloud</button>
        {actions.thank && link.addedBy && link.addedBy.toLowerCase() !== env.me?.toLowerCase() && (
          <button className={`pick ${thanked ? "on" : ""}`} disabled={thanked} onClick={() => actions.thank!(link)} title={`Say thanks to ${link.addedBy}`}>
            🙏 {thanked ? "Thanked" : "Say thanks"}
          </button>
        )}
        {actions.report && <button className="pick" onClick={() => actions.report!(link)} title="Tell the moderators something's wrong">🚩 Report a problem</button>}
        {actions.suggestNote && (
          <button className="pick" onClick={() => actions.suggestNote!(link)} title="Add a public tip, like “needs a login” — a moderator checks it first">
            <Icon name="note" /> Add a note for everyone
          </button>
        )}
        <button className={`pick ${pref.later ? "on" : ""}`} onClick={() => actions.pref(link.id, { later: !pref.later })}><Icon name="clock" /> {pref.later ? "In Read later" : "Read later"}</button>
        <button className={`pick ${pref.done ? "on" : ""}`} onClick={() => actions.pref(link.id, { done: !pref.done })}><Icon name="check" /> {pref.done ? "Done" : "Mark done"}</button>
        <button className="pick" onClick={() => actions.prompt("Rename for yourself", pref.rename || link.name, (v) => actions.pref(link.id, { rename: v.trim() === link.name ? "" : v.trim() }), { placeholder: link.name })}>
          <Icon name="edit" /> Rename for me
        </button>
        <button className="pick" onClick={() => { actions.pref(link.id, { hidden: true }); env.setExpanded(null); actions.toast(`Hid ${link.name} — show it again from the ⋯ menu`); }}>
          <Icon name="eyeOff" /> Hide for me
        </button>
        <button className="pick" onClick={() => env.setExpanded(null)}><Icon name="up" /> Close</button>
      </div>
    </div>
  );
}
