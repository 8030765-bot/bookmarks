"use client";
import { Folder } from "@/lib/types";

/** Optional folder list down the left side (wide screens only — CSS hides it on smaller ones). */
export default function SideNav({ folders, active, onJump, counts }: {
  folders: Folder[];
  active: string | null;
  onJump: (id: string) => void;
  counts: (f: Folder) => number;
}) {
  if (!folders.length) return null;
  return (
    <nav className="side-nav" aria-label="Folders">
      <div className="side-nav-title">Folders</div>
      {folders.map((f) => (
        <button key={f.id} className={active === f.id ? "on" : ""} aria-current={active === f.id ? "true" : undefined} onClick={() => onJump(f.id)}
          style={f.color ? ({ "--folder-accent": f.color } as React.CSSProperties) : undefined}>
          <span className="sn-emoji">{f.emoji}</span>
          <span className="sn-name">{f.name}</span>
          <em>{f.rule ? "✨" : counts(f)}</em>
        </button>
      ))}
    </nav>
  );
}
