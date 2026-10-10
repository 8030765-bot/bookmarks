"use client";
import { useEffect, useState } from "react";

interface Seg { id: string; top: number; height: number; color: string; name: string }

/**
 * A slim map down the right edge (wide screens only): one block per folder,
 * sized by how long it is, with a marker showing where you are.
 */
export default function ScrollMap({ deps, onJump }: { deps: unknown; onJump: (folderId: string) => void }) {
  const [segs, setSegs] = useState<Seg[]>([]);
  const [view, setView] = useState({ top: 0, height: 0 });

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const total = document.documentElement.scrollHeight || 1;
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".folders > .folder-card"));
      setSegs(cards.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.id.replace("folder-", ""),
          top: ((r.top + scrollY) / total) * 100,
          height: Math.max(0.6, (r.height / total) * 100),
          color: getComputedStyle(el).getPropertyValue("--folder-accent").trim() || "var(--border-light)",
          name: el.querySelector(".fh-name")?.textContent || "",
        };
      }));
      setView({ top: (scrollY / total) * 100, height: (innerHeight / total) * 100 });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    const main = document.querySelector(".folders");
    if (main) ro.observe(main);
    return () => { window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); ro.disconnect(); cancelAnimationFrame(frame); };
  }, [deps]);

  if (segs.length < 3) return null;
  return (
    <nav className="scroll-map" aria-label="Folder map">
      {segs.map((s) => (
        <button key={s.id} className="sm-seg" style={{ top: `${s.top}%`, height: `${s.height}%`, background: s.color }} title={s.name} aria-label={`Jump to ${s.name}`} onClick={() => onJump(s.id)} />
      ))}
      <span className="sm-view" style={{ top: `${view.top}%`, height: `${view.height}%` }} />
    </nav>
  );
}
