"use client";
import { CSSProperties, PointerEvent as RPointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUILT_IN_DESIGNS, BuiltDesign, COLS, DEFAULT_CANVAS, DesignCanvas, DesignPiece, FONT_CHOICES, PARTS, PART_BY_ID, PART_FOLDERS, PartDef, PieceStyle, PropDef,
  PropValue, ROW, TEMPLATE_LIST, makePiece, newPieceId, templateDesign,
} from "@/lib/pieces";
import { canvasRows, canvasStyle } from "../components/CustomCanvas";

/**
 * 🎨 The design builder: a Figma-style editor for your own home page.
 *   left   — the parts library (folders of pieces) and the layers list
 *   middle — the canvas: your real home page, with boxes you drag, resize and select
 *   right  — settings for the page or for whatever is selected
 * Pieces snap to the grid; hold Ctrl (⌘ on a Mac) to place them freely,
 * with pink guides when edges line up.
 */

type Draft = Omit<BuiltDesign, "id" | "owner" | "createdAt" | "updatedAt"> & { id?: string; owner?: string; createdAt?: string; updatedAt?: string };
type Me = { user: string | null; role: string | null };
type Lists = { staff: boolean; siteDefault: string; mine: BuiltDesign[]; gallery: BuiltDesign[]; pending?: BuiltDesign[] };
type FolderLite = { id: string; name: string; emoji: string };
type Device = "desktop" | "laptop" | "tablet" | "phone";
const DEVICES: { id: Device; label: string; icon: string; w: number }[] = [
  { id: "desktop", label: "Big screen", icon: "🖥️", w: 1440 },
  { id: "laptop", label: "Laptop / Chromebook", icon: "💻", w: 1280 },
  { id: "tablet", label: "Tablet", icon: "📱", w: 820 },
  { id: "phone", label: "Phone (pieces stack)", icon: "📲", w: 390 },
];
const SWATCHES = ["#ffffff", "#0f1115", "#1c2030", "#7c6cff", "#4dabff", "#3dd68c", "#ffb84d", "#ff5c7a", "#e879f9", "#2dd4bf", "#f7f3ea", "#1d2330"];
const SNAP_PX = 6;
const VIEWERS = ["viewer", "nova-page", "orbit-window", "journal-section", "term-dir"];
const round2 = (n: number) => Math.round(n * 100) / 100;
const capture = (e: RPointerEvent) => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {} };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

async function api<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong — try again");
  return j as T;
}

/* ---------- a tiny drawing of a design, for lists and the gallery ---------- */
export function DesignMini({ d, className = "" }: { d: Pick<BuiltDesign, "canvas" | "pieces">; className?: string }) {
  // the top of the page on a laptop-sized screen
  const rows = 55;
  return (
    <div className={`bl-mini ${className}`} style={{ ...canvasStyle(d.canvas), aspectRatio: "16 / 11" } as CSSProperties}>
      {d.pieces.filter((p) => !p.hidden && p.y < rows).sort((a, b) => a.z - b.z).map((p) => {
        const part = PART_BY_ID.get(p.part);
        const tone = part?.design ? "design" : part?.folder === "Functions & buttons" ? "btn" : part?.deco ? "deco" : part?.folder === "Widgets" ? "widget" : "block";
        return (
          <span key={p.id} className={`bl-mini-p ${tone}`} style={{
            left: `${(p.x / COLS) * 100}%`, top: `${(p.y / rows) * 100}%`, width: `${(p.w / COLS) * 100}%`, height: `${(p.h / rows) * 100}%`,
            background: p.style?.bg || undefined, borderRadius: p.style?.radius !== undefined ? Math.min(p.style.radius, 99) / 4 : undefined,
          }} />
        );
      })}
    </div>
  );
}

/* ---------- small form bits for the settings panel ---------- */
function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="bl-row" title={hint}><span>{label}</span><div>{children}</div></label>;
}
function ColorField({ value, onChange, allowNone = true, placeholder = "none" }: { value?: string; onChange: (v: string | undefined) => void; allowNone?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value || "");
  useEffect(() => setText(value || ""), [value]);
  const six = value && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000";
  return (
    <div className="bl-color">
      <span className="bl-color-sw" style={{ background: value || "transparent" }}>
        <input type="color" value={six} onChange={(e) => onChange(e.target.value + (value && value.length === 9 ? value.slice(7) : ""))} aria-label="Pick a colour" />
      </span>
      <input className="bl-input bl-hex" value={text} placeholder={placeholder} spellCheck={false}
        onChange={(e) => { setText(e.target.value); if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value.trim())) onChange(e.target.value.trim()); }}
        onBlur={() => setText(value || "")} />
      {allowNone && value && <button className="bl-x" title="No colour" onClick={() => onChange(undefined)}>×</button>}
      <div className="bl-swatches">
        {SWATCHES.map((c) => <button key={c} className="bl-swatch" style={{ background: c }} title={c} onClick={() => onChange(c)} />)}
      </div>
    </div>
  );
}
function NumberField({ value, onChange, min, max, step = 1, suffix }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (t: string) => { const n = Number(t); if (Number.isFinite(n)) onChange(clamp(n, min ?? -1e9, max ?? 1e9)); else setText(String(value)); };
  return (
    <span className="bl-num">
      <input className="bl-input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(round2(value + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)), min ?? -1e9, max ?? 1e9)); }
        }} />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}
function Slider({ value, onChange, min, max, step = 1, suffix = "" }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <span className="bl-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <em>{value}{suffix}</em>
    </span>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} className={`bl-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span /></button>;
}
function Section({ title, children, open: startOpen = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className={`bl-sec ${open ? "open" : ""}`}>
      <button className="bl-sec-head" onClick={() => setOpen(!open)}><span>{title}</span><i>{open ? "▾" : "▸"}</i></button>
      {open && <div className="bl-sec-body">{children}</div>}
    </section>
  );
}

/* ====================================================================== */
export default function Builder() {
  const [me, setMe] = useState<Me | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [folders, setFolders] = useState<FolderLite[]>([]);
  const [doc, setDocState] = useState<Draft | null>(null);
  const docRef = useRef<Draft | null>(null);
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [device, setDevice] = useState<Device>("laptop");
  const [zoomPick, setZoomPick] = useState<"fit" | number>("fit");
  const [stageW, setStageW] = useState(1000);
  const [mode, setMode] = useState<"edit" | "try">("edit");
  const [leftTab, setLeftTab] = useState<"parts" | "layers">("parts");
  const [q, setQ] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(["Basic blocks"]));
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"" | "start" | "gallery" | "help" | "share">("");
  const [galleryTab, setGalleryTab] = useState<"gallery" | "mine" | "pending">("gallery");
  const [ready, setReady] = useState(0);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [previewState, setPreviewState] = useState<"home" | "folder" | "search">("home");
  const [phoneH, setPhoneH] = useState(1600);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const clipboard = useRef<DesignPiece[]>([]);
  const layerDrag = useRef("");
  const say = useCallback((m: string) => { setToast(m); window.clearTimeout((say as unknown as { t?: number }).t); (say as unknown as { t?: number }).t = window.setTimeout(() => setToast(""), 2600); }, []);

  /* ---------- loading ---------- */
  const refreshLists = useCallback(() => api<Lists>("/api/designs").then(setLists).catch(() => {}), []);
  useEffect(() => {
    api<Me>("/api/auth").then((m) => setMe({ user: m.user, role: m.role })).catch(() => setMe({ user: null, role: null }));
    refreshLists();
    api<{ folders?: FolderLite[] }>("/api/bookmarks").then((d) => setFolders((d.folders || []).map((f) => ({ id: f.id, name: f.name, emoji: f.emoji })))).catch(() => {});
    document.title = "Design builder";
  }, [refreshLists]);
  // open a design from ?id=, or start fresh
  useEffect(() => {
    if (!me?.user || doc) return;
    const id = new URLSearchParams(location.search).get("id");
    if (id) {
      api<{ design: BuiltDesign }>(`/api/designs?id=${id}`).then(({ design }) => {
        if (design.owner === me.user!.toLowerCase()) openDoc(design);
        else { openDoc({ ...templateDesign("blank"), name: `${design.name} (copy)`, emoji: design.emoji, canvas: design.canvas, pieces: design.pieces }); say("This is someone else's design — you're editing your own copy"); }
      }).catch(() => setModal("start"));
    } else setModal("start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  /* ---------- the document, with undo ---------- */
  const setDoc = useCallback((next: Draft | null, opts: { history?: boolean; before?: Draft | null } = {}) => {
    const prev = opts.before !== undefined ? opts.before : docRef.current;
    docRef.current = next;
    setDocState(next);
    if (opts.history !== false && prev && next) {
      setPast((p) => [...p.slice(-99), prev]);
      setFuture([]);
    }
    if (next) setDirty(true);
  }, []);
  const change = useCallback((fn: (d: Draft) => Draft, history = true) => {
    const cur = docRef.current;
    if (!cur) return;
    setDoc(fn(cur), { history });
  }, [setDoc]);
  function openDoc(d: Draft) {
    docRef.current = d;
    setDocState(d);
    setPast([]);
    setFuture([]);
    setSel([]);
    setDirty(!d.id);
    setModal("");
    if (d.id) history.replaceState(null, "", `/builder?id=${d.id}`);
  }
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length || !docRef.current) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [docRef.current!, ...f]);
      docRef.current = prev;
      setDocState(prev);
      setDirty(true);
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length || !docRef.current) return f;
      const next = f[0];
      setPast((p) => [...p, docRef.current!]);
      docRef.current = next;
      setDocState(next);
      setDirty(true);
      return f.slice(1);
    });
  }, []);

  /* ---------- saving (automatic, a moment after each change) ---------- */
  const saving = useRef(false);
  const save = useCallback(async (): Promise<string | undefined> => {
    const d = docRef.current;
    if (!d || saving.current) return d?.id;
    saving.current = true;
    setStatus("saving");
    try {
      const r = await api<Lists & { saved: BuiltDesign }>("/api/designs", { action: "save", design: { id: d.id, name: d.name, emoji: d.emoji, description: d.description, canvas: d.canvas, pieces: d.pieces } });
      setLists(r);
      const cur = docRef.current;
      // anything changed while it was saving gets saved next time round
      const changedMeanwhile = cur !== d;
      if (cur) {
        const merged = { ...cur, id: r.saved.id, owner: r.saved.owner, gallery: r.saved.gallery, createdAt: r.saved.createdAt, updatedAt: r.saved.updatedAt };
        docRef.current = merged;
        setDocState(merged);
        if (!d.id) history.replaceState(null, "", `/builder?id=${r.saved.id}`);
      }
      setDirty(changedMeanwhile);
      setStatus("saved");
      return r.saved.id;
    } catch (e) {
      setStatus("error");
      say(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      saving.current = false;
    }
  }, [say]);
  useEffect(() => {
    if (!dirty || !doc) return;
    const t = setTimeout(() => { setDirty(false); save(); }, 1200);
    return () => clearTimeout(t);
  }, [doc, dirty, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || saving.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ---------- the live preview (your real home page in a frame) ---------- */
  const post = useCallback((msg: unknown) => iframeRef.current?.contentWindow?.postMessage(msg, location.origin), []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === "preview-ready") setReady((n) => n + 1);
      if (e.data?.type === "preview-height" && typeof e.data.h === "number") setPhoneH(Math.max(600, Math.min(20000, e.data.h)));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  useEffect(() => {
    if (!ready || !doc) return;
    // a timer, not an animation frame: those pause when the tab isn't being drawn
    const id = window.setTimeout(() => post({ type: "design-preview", design: { ...doc, id: doc.id || "draft0000", owner: "", createdAt: "", updatedAt: "" } }), 16);
    return () => window.clearTimeout(id);
  }, [doc, ready, post]);
  useEffect(() => {
    if (!ready) return;
    const firstFolder = folders[0];
    post({ type: "design-section", section: previewState === "folder" && firstFolder ? `folder:${firstFolder.id}` : "home", search: previewState === "search" ? "a" : "" });
  }, [previewState, ready, folders, post]);

  /* ---------- canvas size and zoom ---------- */
  const deviceW = DEVICES.find((d) => d.id === device)!.w;
  const colW = deviceW / COLS;
  const rows = doc ? canvasRows(doc) : 60;
  const frameH = device === "phone" ? phoneH : (rows + 12) * ROW;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [doc]);
  const fitZoom = clamp((stageW - 64) / deviceW, 0.2, 1);
  const zoom = zoomPick === "fit" ? fitZoom : zoomPick;

  /* ---------- pieces ---------- */
  const pieces = useMemo(() => doc?.pieces || [], [doc]);
  const selected = pieces.filter((p) => sel.includes(p.id));
  const one = selected.length === 1 ? selected[0] : null;
  const maxZ = () => Math.max(0, ...(docRef.current?.pieces || []).map((p) => p.z));
  const updatePieces = (ids: string[], fn: (p: DesignPiece) => DesignPiece, history = true) =>
    change((d) => ({ ...d, pieces: d.pieces.map((p) => (ids.includes(p.id) ? fn(p) : p)) }), history);
  const setProp = (id: string, key: string, v: PropValue) => updatePieces([id], (p) => ({ ...p, props: { ...p.props, [key]: v } }));
  const setStyle = (ids: string[], patch: Partial<PieceStyle>) => updatePieces(ids, (p) => {
    const style: PieceStyle = { ...(p.style || {}), ...patch };
    for (const k of Object.keys(style) as (keyof PieceStyle)[]) if (style[k] === undefined) delete style[k];
    return { ...p, style };
  });
  function addPart(partId: string, at?: { x: number; y: number }) {
    const part = PART_BY_ID.get(partId);
    if (!part || !docRef.current) return;
    let x: number, y: number;
    if (at) { x = at.x - part.w / 2; y = at.y - part.h / 2; } else {
      // clicked: the first empty spot from the top of what you're looking at
      const st = stageRef.current;
      const from = st ? Math.max(0, Math.floor((st.scrollTop / zoom) / ROW)) : 0;
      const solid = docRef.current.pieces.filter((o) => !o.hidden && !PART_BY_ID.get(o.part)?.deco && !(VIEWERS.includes(o.part) && o.props?.mode !== "inline"));
      const free = (cx: number, cy: number) => solid.every((o) => cx + part.w <= o.x || cx >= o.x + o.w || cy + part.h <= o.y || cy >= o.y + o.h);
      let spot: { x: number; y: number } | null = null;
      for (let cy = from; cy < from + 400 && !spot; cy++) for (let cx = 0; cx <= COLS - Math.min(part.w, COLS); cx++) if (free(cx, cy)) { spot = { x: cx, y: cy }; break; }
      x = spot ? spot.x : (COLS - part.w) / 2;
      y = spot ? spot.y : from + 2;
    }
    x = clamp(Math.round(x), 0, COLS - Math.min(part.w, COLS));
    y = Math.max(0, Math.round(y));
    const p = makePiece(partId, x, y, maxZ() + 1);
    change((d) => ({ ...d, pieces: [...d.pieces, p] }));
    setSel([p.id]);
    setMode("edit");
  }
  const removeSel = () => {
    const ids = selected.filter((p) => !p.locked).map((p) => p.id);
    if (!ids.length) { if (selected.length) say("🔒 Unlock it first"); return; }
    change((d) => ({ ...d, pieces: d.pieces.filter((p) => !ids.includes(p.id)) }));
    setSel([]);
  };
  const duplicateSel = (offset = 2) => {
    if (!selected.length) return;
    let z = maxZ();
    const copies = selected.map((p) => ({ ...p, id: newPieceId(), x: clamp(p.x + offset / 2, 0, COLS - p.w), y: p.y + offset, z: ++z, locked: false, name: p.name }));
    change((d) => ({ ...d, pieces: [...d.pieces, ...copies] }));
    setSel(copies.map((c) => c.id));
  };
  const paste = () => {
    if (!clipboard.current.length) return;
    let z = maxZ();
    const copies = clipboard.current.map((p) => ({ ...p, id: newPieceId(), y: p.y + 2, z: ++z }));
    clipboard.current = copies;
    change((d) => ({ ...d, pieces: [...d.pieces, ...copies] }));
    setSel(copies.map((c) => c.id));
  };
  const layer = (how: "front" | "back" | "up" | "down") => {
    if (!selected.length || !docRef.current) return;
    const order = [...docRef.current.pieces].sort((a, b) => a.z - b.z).map((p) => p.id);
    const ids = new Set(sel);
    let next = order.filter((id) => !ids.has(id));
    const picked = order.filter((id) => ids.has(id));
    if (how === "front") next = [...next, ...picked];
    else if (how === "back") next = [...picked, ...next];
    else {
      next = [...order];
      const list = how === "up" ? [...picked].reverse() : picked;
      for (const id of list) {
        const i = next.indexOf(id);
        const j = how === "up" ? i + 1 : i - 1;
        if (j < 0 || j >= next.length || ids.has(next[j])) continue;
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    const z = new Map(next.map((id, i) => [id, i + 1]));
    change((d) => ({ ...d, pieces: d.pieces.map((p) => ({ ...p, z: z.get(p.id) || p.z })) }));
  };
  const align = (how: "left" | "center" | "right" | "top" | "middle" | "bottom" | "hdist" | "vdist" | "pageCenter") => {
    if (!selected.length) return;
    const xs = selected.map((p) => p.x), ys = selected.map((p) => p.y);
    const minX = Math.min(...xs), maxR = Math.max(...selected.map((p) => p.x + p.w));
    const minY = Math.min(...ys), maxB = Math.max(...selected.map((p) => p.y + p.h));
    const ids = selected.filter((p) => !p.locked).map((p) => p.id);
    if (how === "hdist" || how === "vdist") {
      const sorted = [...selected].sort((a, b) => (how === "hdist" ? a.x - b.x : a.y - b.y));
      const total = sorted.reduce((n, p) => n + (how === "hdist" ? p.w : p.h), 0);
      const gap = ((how === "hdist" ? maxR - minX : maxB - minY) - total) / Math.max(1, sorted.length - 1);
      let at = how === "hdist" ? minX : minY;
      const pos = new Map<string, number>();
      for (const p of sorted) { pos.set(p.id, round2(at)); at += (how === "hdist" ? p.w : p.h) + gap; }
      updatePieces(ids, (p) => (how === "hdist" ? { ...p, x: pos.get(p.id)! } : { ...p, y: pos.get(p.id)! }));
      return;
    }
    updatePieces(ids, (p) => {
      switch (how) {
        case "left": return { ...p, x: minX };
        case "right": return { ...p, x: round2(maxR - p.w) };
        case "center": return { ...p, x: round2((minX + maxR) / 2 - p.w / 2) };
        case "top": return { ...p, y: minY };
        case "bottom": return { ...p, y: round2(maxB - p.h) };
        case "middle": return { ...p, y: round2((minY + maxB) / 2 - p.h / 2) };
        case "pageCenter": return { ...p, x: round2((COLS - p.w) / 2) };
        default: return p;
      }
    });
  };

  /* ---------- dragging, resizing and box-selecting on the canvas ---------- */
  const drag = useRef<{ kind: "move" | "resize" | "marquee"; dir?: string; sx: number; sy: number; start: Map<string, DesignPiece>; before: Draft; moved: boolean; additive?: boolean } | null>(null);
  const toCanvas = (clientX: number, clientY: number) => {
    const r = overlayRef.current!.getBoundingClientRect();
    return { px: (clientX - r.left) / zoom, py: (clientY - r.top) / zoom };
  };
  function startMove(e: RPointerEvent, p: DesignPiece) {
    if (mode !== "edit" || e.button !== 0) return;
    e.stopPropagation();
    setCtxMenu(null);
    let ids = sel;
    if (e.shiftKey) { ids = sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id]; setSel(ids); return; }
    if (!sel.includes(p.id)) { ids = [p.id]; setSel(ids); }
    const movable = pieces.filter((x) => ids.includes(x.id) && !x.locked);
    if (!movable.length) return;
    capture(e);
    drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, start: new Map(movable.map((x) => [x.id, x])), before: docRef.current!, moved: false };
  }
  function startResize(e: RPointerEvent, p: DesignPiece, dir: string) {
    if (mode !== "edit" || p.locked) return;
    e.stopPropagation();
    capture(e);
    drag.current = { kind: "resize", dir, sx: e.clientX, sy: e.clientY, start: new Map([[p.id, p]]), before: docRef.current!, moved: false };
  }
  function startMarquee(e: RPointerEvent) {
    if (mode !== "edit" || e.button !== 0) return;
    setCtxMenu(null);
    const { px, py } = toCanvas(e.clientX, e.clientY);
    capture(e);
    drag.current = { kind: "marquee", sx: px, sy: py, start: new Map(), before: docRef.current!, moved: false, additive: e.shiftKey };
    if (!e.shiftKey) setSel([]);
  }
  /** Free placement: line edges up with other pieces (and the page's middle), Figma style. */
  function snapToGuides(box: { l: number; t: number; w: number; h: number }, skip: Set<string>) {
    const xs: number[] = [deviceW / 2, 0, deviceW], ys: number[] = [];
    for (const o of pieces) {
      if (skip.has(o.id) || o.hidden) continue;
      xs.push(o.x * colW, (o.x + o.w / 2) * colW, (o.x + o.w) * colW);
      ys.push(o.y * ROW, (o.y + o.h / 2) * ROW, (o.y + o.h) * ROW);
    }
    const lim = SNAP_PX / zoom;
    let dx = 0, dy = 0;
    const gv: number[] = [], gh: number[] = [];
    let best = lim + 1;
    for (const edge of [box.l, box.l + box.w / 2, box.l + box.w]) for (const x of xs) { const d = x - edge; if (Math.abs(d) < Math.abs(best) && Math.abs(d) <= lim) { best = d; dx = d; } }
    if (best <= lim) for (const edge of [box.l + dx, box.l + dx + box.w / 2, box.l + dx + box.w]) for (const x of xs) if (Math.abs(x - edge) < 0.5) gv.push(x);
    best = lim + 1;
    for (const edge of [box.t, box.t + box.h / 2, box.t + box.h]) for (const y of ys) { const d = y - edge; if (Math.abs(d) < Math.abs(best) && Math.abs(d) <= lim) { best = d; dy = d; } }
    if (best <= lim) for (const edge of [box.t + dy, box.t + dy + box.h / 2, box.t + dy + box.h]) for (const y of ys) if (Math.abs(y - edge) < 0.5) gh.push(y);
    return { dx, dy, gv: Array.from(new Set(gv)), gh: Array.from(new Set(gh)) };
  }
  function onPointerMove(e: RPointerEvent) {
    const g = drag.current;
    if (!g) return;
    const free = e.ctrlKey || e.metaKey;
    if (g.kind === "marquee") {
      const { px, py } = toCanvas(e.clientX, e.clientY);
      const r = { x: Math.min(px, g.sx), y: Math.min(py, g.sy), w: Math.abs(px - g.sx), h: Math.abs(py - g.sy) };
      setMarquee(r);
      if (r.w > 3 || r.h > 3) {
        const hit = pieces.filter((p) => !p.hidden && p.x * colW < r.x + r.w && (p.x + p.w) * colW > r.x && p.y * ROW < r.y + r.h && (p.y + p.h) * ROW > r.y).map((p) => p.id);
        setSel(g.additive ? Array.from(new Set([...sel, ...hit])) : hit);
      }
      return;
    }
    const dxPx = (e.clientX - g.sx) / zoom, dyPx = (e.clientY - g.sy) / zoom;
    if (!g.moved && Math.abs(dxPx) < 2 && Math.abs(dyPx) < 2) return;
    g.moved = true;
    const base = g.before;
    if (g.kind === "move") {
      const group = Array.from(g.start.values());
      const l = Math.min(...group.map((p) => p.x)) * colW + dxPx, t = Math.min(...group.map((p) => p.y)) * ROW + dyPx;
      const w = (Math.max(...group.map((p) => p.x + p.w)) - Math.min(...group.map((p) => p.x))) * colW;
      const h = (Math.max(...group.map((p) => p.y + p.h)) - Math.min(...group.map((p) => p.y))) * ROW;
      let dc: number, dr: number;
      if (free) {
        const s = snapToGuides({ l, t, w, h }, new Set(g.start.keys()));
        dc = (dxPx + s.dx) / colW; dr = (dyPx + s.dy) / ROW;
        setGuides({ v: s.gv, h: s.gh });
      } else {
        dc = Math.round(dxPx / colW); dr = Math.round(dyPx / ROW);
        setGuides({ v: [], h: [] });
      }
      const minX = Math.min(...group.map((p) => p.x)), maxR = Math.max(...group.map((p) => p.x + p.w)), minY = Math.min(...group.map((p) => p.y));
      dc = clamp(dc, -minX, COLS - maxR);
      dr = Math.max(dr, -minY);
      setDoc({ ...base, pieces: base.pieces.map((p) => (g.start.has(p.id) ? { ...p, x: round2(p.x + dc), y: round2(p.y + dr) } : p)) }, { history: false });
    } else if (g.kind === "resize") {
      const p0 = Array.from(g.start.values())[0];
      const dir = g.dir!;
      let { x, y, w, h } = p0;
      const dc = dxPx / colW, dr = dyPx / ROW;
      if (dir.includes("e")) w = p0.w + dc;
      if (dir.includes("s")) h = p0.h + dr;
      if (dir.includes("w")) { x = p0.x + dc; w = p0.w - dc; }
      if (dir.includes("n")) { y = p0.y + dr; h = p0.h - dr; }
      if (free) {
        const s = snapToGuides({ l: x * colW, t: y * ROW, w: w * colW, h: h * ROW }, new Set([p0.id]));
        if (dir.includes("e")) w += s.dx / colW;
        if (dir.includes("w")) { x += s.dx / colW; w -= s.dx / colW; }
        if (dir.includes("s")) h += s.dy / ROW;
        if (dir.includes("n")) { y += s.dy / ROW; h -= s.dy / ROW; }
        setGuides({ v: s.gv, h: s.gh });
      } else {
        const r = (n: number) => Math.round(n);
        if (dir.includes("e")) w = r(x + w) - x;
        if (dir.includes("w")) { const nx = r(x); w += x - nx; x = nx; }
        if (dir.includes("s")) h = r(y + h) - y;
        if (dir.includes("n")) { const ny = r(y); h += y - ny; y = ny; }
        setGuides({ v: [], h: [] });
      }
      const minW = free ? 0.5 : 1, minH = free ? 0.5 : 1;
      if (w < minW) { if (dir.includes("w")) x -= minW - w; w = minW; }
      if (h < minH) { if (dir.includes("n")) y -= minH - h; h = minH; }
      if (x < 0) { w += x; x = 0; }
      if (x + w > COLS) w = COLS - x;
      if (y < 0) { h += y; y = 0; }
      setDoc({ ...base, pieces: base.pieces.map((p) => (p.id === p0.id ? { ...p, x: round2(x), y: round2(y), w: round2(w), h: round2(h) } : p)) }, { history: false });
    }
  }
  function onPointerUp() {
    const g = drag.current;
    drag.current = null;
    setGuides({ v: [], h: [] });
    setMarquee(null);
    if (!g || g.kind === "marquee" || !g.moved) return;
    // one undo step for the whole drag
    setPast((p) => [...p.slice(-99), g.before]);
    setFuture([]);
    setDirty(true);
  }

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setCtrlHeld(true);
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "s") { e.preventDefault(); setDirty(false); save().then((id) => id && say("Saved ✓")); return; }
      if (!docRef.current) return;
      if (mod && k === "a") { e.preventDefault(); setSel(docRef.current.pieces.filter((p) => !p.hidden).map((p) => p.id)); return; }
      if (mod && k === "d") { e.preventDefault(); duplicateSel(); return; }
      if (mod && k === "c") { clipboard.current = selected.map((p) => ({ ...p })); if (selected.length) say(`Copied ${selected.length} piece${selected.length === 1 ? "" : "s"}`); return; }
      if (mod && k === "x") { clipboard.current = selected.map((p) => ({ ...p })); removeSel(); return; }
      if (mod && k === "v") { e.preventDefault(); paste(); return; }
      if (mod && (k === "=" || k === "+")) { e.preventDefault(); setZoomPick(round2(Math.min(2, zoom + 0.1))); return; }
      if (mod && k === "-") { e.preventDefault(); setZoomPick(round2(Math.max(0.2, zoom - 0.1))); return; }
      if (mod && k === "0") { e.preventDefault(); setZoomPick("fit"); return; }
      if (k === "delete" || k === "backspace") { if (selected.length) { e.preventDefault(); removeSel(); } return; }
      if (k === "escape") { setSel([]); setCtxMenu(null); setModal((m) => (m === "start" && !docRef.current ? m : "")); return; }
      if (k === "]") { layer(mod ? "front" : "up"); return; }
      if (k === "[") { layer(mod ? "back" : "down"); return; }
      if (k === "g" && !mod) { setShowGrid((s) => !s); return; }
      if (k === "p" && !mod) { setMode((m) => (m === "edit" ? "try" : "edit")); return; }
      if (k === "?" ) { setModal("help"); return; }
      if (mod && e.shiftKey && k === "l") { e.preventDefault(); updatePieces(sel, (p) => ({ ...p, locked: !p.locked })); return; }
      if (mod && e.shiftKey && k === "h") { e.preventDefault(); updatePieces(sel, (p) => ({ ...p, hidden: !p.hidden })); return; }
      if (k.startsWith("arrow") && selected.length) {
        e.preventDefault();
        const step = mod ? 0.25 : e.shiftKey ? 4 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        updatePieces(selected.filter((p) => !p.locked).map((p) => p.id), (p) => ({ ...p, x: round2(clamp(p.x + dx, 0, COLS - p.w)), y: round2(Math.max(0, p.y + dy)) }));
      }
    };
    const up = (e: KeyboardEvent) => { if (e.key === "Control" || e.key === "Meta") setCtrlHeld(false); };
    const blur = () => setCtrlHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  });

  /* ---------- design-level actions ---------- */
  async function useDesign() {
    const id = docRef.current?.id || (await save());
    if (!id) return;
    await api("/api/designs", { action: "use", id }).catch(() => {});
    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage({ type: "use-design", id }, location.origin); window.opener.focus(); say("✅ It's on — look at your other tab"); return; } catch {}
    }
    window.open(`/?design=${id}`, "_blank");
  }
  async function share(on: boolean) {
    const id = docRef.current?.id || (await save());
    if (!id) return;
    try {
      const r = await api<Lists>("/api/designs", { action: on ? "share" : "unshare", id });
      setLists(r);
      const mine = r.mine.find((d) => d.id === id);
      if (docRef.current) { docRef.current = { ...docRef.current, gallery: mine?.gallery }; setDocState(docRef.current); }
      say(on ? (mine?.gallery === "approved" ? "🌍 It's in the gallery!" : "📨 Sent — a moderator will check it, then it shows in the gallery") : "Taken out of the gallery");
    } catch (e) { say(e instanceof Error ? e.message : "Couldn't do that"); }
  }
  async function galleryAction(action: string, id: string, okMsg: string) {
    try {
      const r = await api<Lists & { saved?: BuiltDesign }>("/api/designs", { action, id });
      setLists(r);
      say(okMsg);
      return r;
    } catch (e) { say(e instanceof Error ? e.message : "Couldn't do that"); }
  }
  async function setSiteDefault(id: string) {
    try {
      await api("/api/bookmarks", { action: "setSettings", settings: { defaultDesign: id } });
      await refreshLists();
      say(id ? "⭐ New visitors will now start with this design" : "New visitors start with the normal design again");
    } catch (e) { say(e instanceof Error ? e.message : "Only admins can do that"); }
  }
  function newFromTemplate(key: string) {
    const t = templateDesign(key);
    const name = key === "blank" ? "My design" : `My ${TEMPLATE_LIST.find((x) => x[0] === key)?.[1] || ""} remix`;
    openDoc({ name, emoji: "🎨", ...t });
    history.replaceState(null, "", "/builder");
  }
  async function deleteDoc() {
    const d = docRef.current;
    if (!d) return;
    if (!confirm(`Delete “${d.name}”? This can't be undone.`)) return;
    if (d.id) await galleryAction("delete", d.id, "Deleted");
    docRef.current = null;
    setDocState(null);
    setModal("start");
    history.replaceState(null, "", "/builder");
  }

  /* ====================================================================== */
  if (!me) return <div className="bl-app bl-center"><div className="bl-spinner" /></div>;
  if (!me.user) {
    return (
      <div className="bl-app bl-center">
        <div className="bl-card">
          <h1>🎨 Design builder</h1>
          <p>Build your own home page out of pieces of every design — drag, drop, resize and colour everything.</p>
          <p><strong>Log in first</strong> so your designs are saved to your account.</p>
          <a className="bl-btn primary" href="/">Log in on the home page</a>
        </div>
      </div>
    );
  }

  const staff = !!lists?.staff;
  const isAdmin = me.role === "owner" || me.role === "admin";
  const canvas = doc?.canvas || DEFAULT_CANVAS;
  const setCanvas = (patch: Partial<DesignCanvas>) => change((d) => ({ ...d, canvas: { ...d.canvas, ...patch } }));
  const editing = mode === "edit" && device !== "phone";

  /* ---------- the parts library ---------- */
  const matching = q.trim() ? PARTS.filter((p) => `${p.name} ${p.blurb} ${p.folder}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const partItem = (p: PartDef) => (
    <button key={p.id} className="bl-part" draggable title={p.blurb}
      onDragStart={(e) => { e.dataTransfer.setData("application/x-part", p.id); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={() => addPart(p.id)}>
      <span className="bl-part-emoji">{p.emoji}</span>
      <span className="bl-part-text"><strong>{p.name}</strong><em>{p.blurb}</em></span>
    </button>
  );
  const folderNode = (name: string, path: string, depth: number, children: ReactNode, count: number, emoji = "📁") => {
    const open = openFolders.has(path);
    return (
      <div key={path} className={`bl-folder depth-${depth}`}>
        <button className="bl-folder-head" onClick={() => setOpenFolders((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n; })}>
          <i>{open ? "▾" : "▸"}</i><span>{open ? "📂" : emoji}</span><strong>{name}</strong><em>{count}</em>
        </button>
        {open && <div className="bl-folder-body">{children}</div>}
      </div>
    );
  };
  const designFolders = BUILT_IN_DESIGNS.map(([id, label]) => {
    const list = PARTS.filter((p) => p.folder === `Design pieces/${label}`);
    const emoji = { classic: "📄", nova: "✨", orbit: "🪐", board: "🗂️", desk: "🖥️", journal: "📰", terminal: "💻", zen: "🍃" }[id] || "📁";
    return folderNode(label, `Design pieces/${label}`, 1, list.map(partItem), list.length, emoji);
  });
  const library = matching ? (
    <div className="bl-parts-flat">{matching.length ? matching.map(partItem) : <p className="bl-muted">Nothing called that.</p>}</div>
  ) : (
    <>
      {PART_FOLDERS.map((f) => f === "Design pieces"
        ? folderNode("Design pieces", f, 0, designFolders, PARTS.filter((p) => p.folder.startsWith("Design pieces")).length, "🎨")
        : folderNode(f, f, 0, PARTS.filter((p) => p.folder === f).map(partItem), PARTS.filter((p) => p.folder === f).length,
          { "Basic blocks": "🧱", Widgets: "🧩", "Shapes & decoration": "🔷", "Functions & buttons": "🔘" }[f]))}
    </>
  );

  /* ---------- layers ---------- */
  const layers = [...pieces].sort((a, b) => b.z - a.z);
  const layerList = (
    <div className="bl-layers">
      {layers.length === 0 && <p className="bl-muted">No pieces yet — drag some in from Parts.</p>}
      {layers.map((p) => {
        const part = PART_BY_ID.get(p.part);
        return (
          <div key={p.id} className={`bl-layer ${sel.includes(p.id) ? "on" : ""} ${p.hidden ? "hidden" : ""}`} draggable
            onDragStart={() => { layerDrag.current = p.id; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = layerDrag.current;
              if (!from || from === p.id) return;
              // drop above this layer
              const order = [...pieces].sort((a, b) => a.z - b.z).map((x) => x.id).filter((id) => id !== from);
              order.splice(order.indexOf(p.id) + 1, 0, from);
              const z = new Map(order.map((id, i) => [id, i + 1]));
              change((d) => ({ ...d, pieces: d.pieces.map((x) => ({ ...x, z: z.get(x.id) || x.z })) }));
            }}
            onClick={(e) => setSel(e.shiftKey ? (sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id]) : [p.id])}>
            <span className="bl-layer-emoji">{part?.emoji}</span>
            <span className="bl-layer-name">{p.name || part?.name}</span>
            <button title={p.hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); updatePieces([p.id], (x) => ({ ...x, hidden: !x.hidden })); }}>{p.hidden ? "🙈" : "👁️"}</button>
            <button title={p.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); updatePieces([p.id], (x) => ({ ...x, locked: !x.locked })); }}>{p.locked ? "🔒" : "🔓"}</button>
          </div>
        );
      })}
    </div>
  );

  /* ---------- the settings panel ---------- */
  const propField = (p: DesignPiece, def: PropDef) => {
    const v = p.props?.[def.key] ?? def.def;
    if (def.when) {
      const [k, vals] = def.when;
      if (!vals.includes(p.props?.[k] ?? (PART_BY_ID.get(p.part)?.props?.find((x) => x.key === k)?.def as PropValue))) return null;
    }
    let field: ReactNode;
    switch (def.type) {
      case "bool": field = <Toggle on={!!v} onChange={(x) => setProp(p.id, def.key, x)} />; break;
      case "number": field = <NumberField value={Number(v)} min={def.min} max={def.max} onChange={(x) => setProp(p.id, def.key, x)} />; break;
      case "select": case "action":
        field = <select className="bl-input" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)}>{(def.options || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
        break;
      case "folder":
        field = (
          <select className="bl-input" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)}>
            <option value="">— pick a folder —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
          </select>
        );
        break;
      case "color": field = <ColorField value={String(v)} allowNone={false} onChange={(x) => x && setProp(p.id, def.key, x)} />; break;
      case "longtext": field = <textarea className="bl-input" rows={4} value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      case "date": field = <input className="bl-input" type="date" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      case "time": field = <input className="bl-input" type="time" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      case "emoji": field = <input className="bl-input bl-emoji-in" value={String(v)} maxLength={16} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      default: field = <input className="bl-input" value={String(v)} placeholder={def.type === "url" ? "https://…" : ""} onChange={(e) => setProp(p.id, def.key, e.target.value)} />;
    }
    return <Row key={def.key} label={def.label} hint={def.hint}>{field}</Row>;
  };
  const styleOf = (p: DesignPiece) => p.style || {};
  const ids = sel;
  const pageSettings = doc && (
    <>
      <div className="bl-panel-head"><span className="bl-panel-emoji">📄</span><div><strong>Page</strong><em>Nothing selected — these change the whole page</em></div></div>
      <Section title="Design">
        <Row label="Name"><input className="bl-input" value={doc.name} maxLength={40} onChange={(e) => change((d) => ({ ...d, name: e.target.value }), false)} /></Row>
        <Row label="Icon"><input className="bl-input bl-emoji-in" value={doc.emoji} maxLength={8} onChange={(e) => change((d) => ({ ...d, emoji: e.target.value }), false)} /></Row>
        <Row label="About it"><textarea className="bl-input" rows={2} maxLength={160} value={doc.description || ""} placeholder="Shown in the gallery" onChange={(e) => change((d) => ({ ...d, description: e.target.value }), false)} /></Row>
      </Section>
      <Section title="Colours">
        <Row label="Background"><ColorField value={canvas.bg} allowNone={false} onChange={(v) => v && setCanvas({ bg: v })} /></Row>
        <Row label="Pattern">
          <select className="bl-input" value={canvas.bgPattern || "none"} onChange={(e) => setCanvas({ bgPattern: e.target.value as DesignCanvas["bgPattern"] })}>
            {[["none", "None"], ["dots", "Dots"], ["grid", "Grid"], ["gradient", "Soft gradient"], ["aurora", "Aurora glow"], ["stripes", "Stripes"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Row>
        <Row label="Picture"><input className="bl-input" value={canvas.bgImage || ""} placeholder="https://… (optional)" onChange={(e) => setCanvas({ bgImage: e.target.value })} /></Row>
        <Row label="Text"><ColorField value={canvas.text} allowNone={false} onChange={(v) => v && setCanvas({ text: v })} /></Row>
        <Row label="Accent"><ColorField value={canvas.accent} allowNone={false} onChange={(v) => v && setCanvas({ accent: v })} /></Row>
        <Row label="Cards & menus" hint="Whether the site's own cards, menus and pop-ups are dark or light">
          <div className="bl-seg">{(["dark", "light"] as const).map((t) => <button key={t} className={canvas.tone === t ? "on" : ""} onClick={() => setCanvas({ tone: t })}>{t === "dark" ? "🌙 Dark" : "☀️ Light"}</button>)}</div>
        </Row>
      </Section>
      <Section title="Text">
        <Row label="Font"><select className="bl-input" value={canvas.font} onChange={(e) => setCanvas({ font: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Row>
      </Section>
      <Section title="Size">
        <Row label="Page height" hint="It also grows by itself as you add pieces lower down"><NumberField value={canvas.rows} min={20} max={600} onChange={(v) => setCanvas({ rows: v })} suffix="rows" /></Row>
      </Section>
      <Section title="Start again" open={false}>
        <p className="bl-muted">Swap everything for one of the starting points (you can undo).</p>
        <div className="bl-tpl-mini">
          {TEMPLATE_LIST.map(([k, l, e]) => <button key={k} className="bl-btn" onClick={() => { const t = templateDesign(k); change((d) => ({ ...d, ...t })); setSel([]); }}>{e} {l}</button>)}
        </div>
      </Section>
      {isAdmin && doc.id && (
        <Section title="🛡️ Admin" open={false}>
          <p className="bl-muted">{lists?.siteDefault === doc.id ? "⭐ This is what new visitors start with." : "Make new visitors start with this design (people who already picked a look keep theirs)."}</p>
          <button className="bl-btn" onClick={() => setSiteDefault(lists?.siteDefault === doc.id ? "" : doc.id!)}>{lists?.siteDefault === doc.id ? "Stop using it as the default" : "⭐ Make it the site default"}</button>
        </Section>
      )}
    </>
  );
  const pieceSettings = one && (() => {
    const part = PART_BY_ID.get(one.part)!;
    const s = styleOf(one);
    return (
      <>
        <div className="bl-panel-head">
          <span className="bl-panel-emoji">{part.emoji}</span>
          <div>
            <input className="bl-input bl-name-in" value={one.name ?? ""} placeholder={part.name} maxLength={40} onChange={(e) => updatePieces([one.id], (p) => ({ ...p, name: e.target.value || undefined }), false)} />
            <em>{part.folder.replace("Design pieces/", "From ")} · {part.blurb}</em>
          </div>
        </div>
        <div className="bl-quick">
          <button title="Duplicate (Ctrl D)" onClick={() => duplicateSel()}>⧉</button>
          <button title={one.locked ? "Unlock" : "Lock in place"} onClick={() => updatePieces([one.id], (p) => ({ ...p, locked: !p.locked }))}>{one.locked ? "🔒" : "🔓"}</button>
          <button title={one.hidden ? "Show" : "Hide"} onClick={() => updatePieces([one.id], (p) => ({ ...p, hidden: !p.hidden }))}>{one.hidden ? "🙈" : "👁️"}</button>
          <button title="Bring to front (Ctrl ])" onClick={() => layer("front")}>⤒</button>
          <button title="Forward (])" onClick={() => layer("up")}>↑</button>
          <button title="Backward ([)" onClick={() => layer("down")}>↓</button>
          <button title="Send to back (Ctrl [)" onClick={() => layer("back")}>⤓</button>
          <button className="danger" title="Delete (Del)" onClick={removeSel}>🗑</button>
        </div>
        <Section title="Position & size">
          <div className="bl-grid4">
            <label><span>X</span><NumberField value={one.x} step={0.25} min={0} max={COLS - one.w} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, x: round2(v) }))} /></label>
            <label><span>Y</span><NumberField value={one.y} step={0.25} min={0} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, y: round2(v) }))} /></label>
            <label><span>W</span><NumberField value={one.w} step={0.25} min={0.5} max={COLS - one.x} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, w: round2(v) }))} /></label>
            <label><span>H</span><NumberField value={one.h} step={0.25} min={0.5} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, h: round2(v) }))} /></label>
          </div>
          <p className="bl-muted small">X and W are in columns ({COLS} across the screen); Y and H are in rows of {ROW}px.</p>
          <div className="bl-seg wrap">
            <button onClick={() => align("pageCenter")}>↔ Centre on page</button>
            <button onClick={() => updatePieces([one.id], (p) => ({ ...p, x: 0, w: COLS }))}>⟷ Full width</button>
          </div>
        </Section>
        {(part.props || []).length > 0 && <Section title="Options">{(part.props || []).map((d) => propField(one, d))}</Section>}
        <Section title="Colours">
          <Row label="Background"><ColorField value={s.bg} onChange={(v) => setStyle(ids, { bg: v })} placeholder={part.design ? "the design's own" : "none"} /></Row>
          <Row label="Glass" hint="Frosted see-through background"><Toggle on={!!s.glass} onChange={(v) => setStyle(ids, { glass: v || undefined })} /></Row>
          <Row label="Text"><ColorField value={s.text} onChange={(v) => setStyle(ids, { text: v })} placeholder="page's" /></Row>
          <Row label="Accent"><ColorField value={s.accent} onChange={(v) => setStyle(ids, { accent: v })} placeholder="page's" /></Row>
          <Row label="See-through"><Slider value={Math.round((s.opacity ?? 1) * 100)} min={5} max={100} suffix="%" onChange={(v) => setStyle(ids, { opacity: v >= 100 ? undefined : v / 100 })} /></Row>
        </Section>
        <Section title="Shape">
          <Row label="Corners"><Slider value={Math.min(s.radius ?? 0, 80)} min={0} max={80} suffix="px" onChange={(v) => setStyle(ids, { radius: v })} /></Row>
          <Row label="Round"><Toggle on={(s.radius ?? 0) >= 999} onChange={(v) => setStyle(ids, { radius: v ? 999 : 16 })} /></Row>
          <Row label="Border"><Slider value={s.borderWidth ?? 0} min={0} max={12} suffix="px" onChange={(v) => setStyle(ids, { borderWidth: v || undefined })} /></Row>
          {(s.borderWidth ?? 0) > 0 && <Row label="Border colour"><ColorField value={s.borderColor} onChange={(v) => setStyle(ids, { borderColor: v })} placeholder="soft" /></Row>}
          <Row label="Shadow">
            <div className="bl-seg">{(["none", "soft", "strong", "glow"] as const).map((k) => <button key={k} className={(s.shadow || "none") === k ? "on" : ""} onClick={() => setStyle(ids, { shadow: k === "none" ? undefined : k })}>{k === "none" ? "None" : k[0].toUpperCase() + k.slice(1)}</button>)}</div>
          </Row>
          <Row label="Padding"><Slider value={s.pad ?? 0} min={0} max={60} suffix="px" onChange={(v) => setStyle(ids, { pad: v || undefined })} /></Row>
        </Section>
        <Section title="Font">
          <Row label="Font"><select className="bl-input" value={s.font || ""} onChange={(e) => setStyle(ids, { font: e.target.value || undefined })}><option value="">Page&apos;s font</option>{FONT_CHOICES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Row>
          <Row label="Text size"><Slider value={s.size ?? 100} min={50} max={250} step={5} suffix="%" onChange={(v) => setStyle(ids, { size: v === 100 ? undefined : v })} /></Row>
        </Section>
        <Section title="Layering & phones">
          <div className="bl-seg wrap">
            <button onClick={() => layer("front")}>⤒ Front</button><button onClick={() => layer("up")}>↑ Forward</button>
            <button onClick={() => layer("down")}>↓ Backward</button><button onClick={() => layer("back")}>⤓ Back</button>
          </div>
          <Row label="Lock in place"><Toggle on={!!one.locked} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, locked: v || undefined }))} /></Row>
          <Row label="Hide"><Toggle on={!!one.hidden} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, hidden: v || undefined }))} /></Row>
          <Row label="On phones">
            <div className="bl-seg">
              {(["show", "hide"] as const).map((k) => {
                const cur = s.phone || (part.deco ? "hide" : "show");
                return <button key={k} className={cur === k ? "on" : ""} onClick={() => setStyle(ids, { phone: k })}>{k === "show" ? "Show" : "Hide"}</button>;
              })}
            </div>
          </Row>
        </Section>
      </>
    );
  })();
  const multiSettings = selected.length > 1 && (
    <>
      <div className="bl-panel-head"><span className="bl-panel-emoji">🧩</span><div><strong>{selected.length} pieces</strong><em>Shift-click to add or remove pieces</em></div></div>
      <Section title="Line up">
        <div className="bl-seg wrap">
          <button title="Left edges" onClick={() => align("left")}>⇤ Left</button><button title="Middles" onClick={() => align("center")}>↔ Centre</button><button title="Right edges" onClick={() => align("right")}>⇥ Right</button>
          <button title="Top edges" onClick={() => align("top")}>⤒ Top</button><button title="Middles" onClick={() => align("middle")}>↕ Middle</button><button title="Bottoms" onClick={() => align("bottom")}>⤓ Bottom</button>
          <button title="Same gaps across" onClick={() => align("hdist")}>⋯ Space across</button><button title="Same gaps down" onClick={() => align("vdist")}>⋮ Space down</button>
        </div>
      </Section>
      <Section title="Colours (all of them)">
        <Row label="Background"><ColorField value={undefined} onChange={(v) => setStyle(ids, { bg: v })} /></Row>
        <Row label="Text"><ColorField value={undefined} onChange={(v) => setStyle(ids, { text: v })} /></Row>
        <Row label="Corners"><Slider value={styleOf(selected[0]).radius ?? 0} min={0} max={80} suffix="px" onChange={(v) => setStyle(ids, { radius: v })} /></Row>
        <Row label="Shadow">
          <div className="bl-seg">{(["none", "soft", "strong", "glow"] as const).map((k) => <button key={k} onClick={() => setStyle(ids, { shadow: k === "none" ? undefined : k })}>{k === "none" ? "None" : k[0].toUpperCase() + k.slice(1)}</button>)}</div>
        </Row>
      </Section>
      <Section title="Everything selected">
        <div className="bl-seg wrap">
          <button onClick={() => duplicateSel()}>⧉ Duplicate</button>
          <button onClick={() => updatePieces(ids, (p) => ({ ...p, locked: !selected.every((x) => x.locked) || undefined }))}>🔒 Lock / unlock</button>
          <button onClick={() => layer("front")}>⤒ Front</button><button onClick={() => layer("back")}>⤓ Back</button>
          <button className="danger" onClick={removeSel}>🗑 Delete</button>
        </div>
      </Section>
    </>
  );

  /* ---------- the canvas ---------- */
  const H = frameH;
  const handles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const statusText = status === "saving" ? "Saving…" : status === "error" ? "⚠️ Not saved" : dirty ? "Edited" : doc?.id ? "Saved ✓" : "Not saved yet";

  return (
    <div className={`bl-app ${ctrlHeld ? "free" : ""}`} onPointerUp={onPointerUp}>
      {/* top bar */}
      <header className="bl-top">
        <a className="bl-home" href="/" title="Back to the bookmarks">🔖</a>
        <div className="bl-docname">
          {doc ? (
            <>
              <span>{doc.emoji}</span>
              <input value={doc.name} maxLength={40} aria-label="Design name" onChange={(e) => change((d) => ({ ...d, name: e.target.value }), false)} />
              <em className={`bl-status ${status}`}>{statusText}</em>
            </>
          ) : <strong>Design builder</strong>}
        </div>
        <div className="bl-tools">
          <button title="Undo (Ctrl Z)" disabled={!past.length} onClick={undo}>↶</button>
          <button title="Redo (Ctrl Shift Z)" disabled={!future.length} onClick={redo}>↷</button>
          <span className="bl-sep" />
          <div className="bl-seg dark" role="group" aria-label="Screen size">
            {DEVICES.map((d) => <button key={d.id} title={`${d.label} (${d.w}px)`} className={device === d.id ? "on" : ""} onClick={() => setDevice(d.id)}>{d.icon}</button>)}
          </div>
          <select className="bl-zoom" value={zoomPick === "fit" ? "fit" : String(zoomPick)} onChange={(e) => setZoomPick(e.target.value === "fit" ? "fit" : Number(e.target.value))} aria-label="Zoom">
            <option value="fit">Fit ({Math.round(fitZoom * 100)}%)</option>
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
            {zoomPick !== "fit" && ![0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].includes(zoomPick) && <option value={zoomPick}>{Math.round(zoomPick * 100)}%</option>}
          </select>
          <span className="bl-sep" />
          <div className="bl-seg dark" role="group" aria-label="Mode">
            <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")} title="Move and change pieces">✏️ Edit</button>
            <button className={mode === "try" ? "on" : ""} onClick={() => { setMode("try"); setSel([]); }} title="Click around your design for real (P)">▶ Try it</button>
          </div>
          <select className="bl-zoom" value={previewState} onChange={(e) => setPreviewState(e.target.value as typeof previewState)} title="See how pop-ups and search look" aria-label="Show">
            <option value="home">Show: Home</option>
            <option value="folder">Show: a folder open</option>
            <option value="search">Show: searching</option>
          </select>
        </div>
        <div className="bl-right">
          <button className="bl-btn ghost" onClick={() => { refreshLists(); setGalleryTab("mine"); setModal("gallery"); }}>📚 Designs</button>
          <button className="bl-btn ghost" onClick={() => setModal("help")} title="Shortcuts and tips (?)">❓</button>
          {doc && <button className="bl-btn ghost" onClick={() => setModal("share")}>🌍 Share</button>}
          {doc && <button className="bl-btn primary" onClick={useDesign}>✅ Use this design</button>}
        </div>
      </header>

      {/* parts and layers */}
      <aside className="bl-left">
        <div className="bl-tabs">
          <button className={leftTab === "parts" ? "on" : ""} onClick={() => setLeftTab("parts")}>🧱 Parts</button>
          <button className={leftTab === "layers" ? "on" : ""} onClick={() => setLeftTab("layers")}>🗂 Layers <em>{pieces.length}</em></button>
        </div>
        {leftTab === "parts" ? (
          <>
            <input className="bl-input bl-search" placeholder={`Search ${PARTS.length} parts…`} value={q} onChange={(e) => setQ(e.target.value)} />
            <p className="bl-muted small">Drag a part onto the page, or click it.</p>
            <div className="bl-scroll">{library}</div>
          </>
        ) : <div className="bl-scroll">{layerList}</div>}
      </aside>

      {/* the canvas */}
      <main className={`bl-stage ${mode}`} ref={stageRef} onPointerDown={(e) => { if (e.target === e.currentTarget) { setSel([]); setCtxMenu(null); } }}
        onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoomPick(round2(clamp(zoom - Math.sign(e.deltaY) * 0.08, 0.2, 2))); } }}>
        {doc ? (
          <div className="bl-frame" style={{ width: deviceW * zoom, height: H * zoom }}>
            <div className="bl-scale" style={{ width: deviceW, height: H, transform: `scale(${zoom})` }}>
              <iframe ref={iframeRef} className="bl-iframe" src="/?builder=preview" title="Your design" style={{ width: deviceW, height: H }} tabIndex={mode === "try" ? 0 : -1} />
              {editing && (
                <div ref={overlayRef} className={`bl-overlay ${showGrid ? "grid" : ""}`} style={{ "--colw": `${colW}px`, "--row": `${ROW}px` } as CSSProperties}
                  onPointerDown={startMarquee} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-part")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("application/x-part");
                    if (!id) return;
                    e.preventDefault();
                    const { px, py } = toCanvas(e.clientX, e.clientY);
                    addPart(id, { x: px / colW, y: py / ROW });
                  }}>
                  <div className="bl-pagebottom" style={{ top: rows * ROW }}><span>end of page · {rows} rows</span></div>
                  {[...pieces].sort((a, b) => a.z - b.z).map((p) => {
                    const part = PART_BY_ID.get(p.part);
                    const on = sel.includes(p.id);
                    // pop-up folder windows take no room on the page: grab them by their label (or in Layers)
                    const popup = VIEWERS.includes(p.part) && p.props?.mode !== "inline";
                    return (
                      <div key={p.id} className={`bl-box ${on ? "on" : ""} ${p.locked ? "locked" : ""} ${p.hidden ? "hidden" : ""} ${part?.design ? "design" : ""} ${popup ? "popup" : ""}`}
                        style={{ left: p.x * colW, top: p.y * ROW, width: p.w * colW, height: p.h * ROW }}
                        onPointerDown={(e) => startMove(e, p)}
                        onDoubleClick={() => { setLeftTab("layers"); }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!sel.includes(p.id)) setSel([p.id]); const r = stageRef.current!.getBoundingClientRect(); setCtxMenu({ x: e.clientX - r.left + stageRef.current!.scrollLeft, y: e.clientY - r.top + stageRef.current!.scrollTop }); }}>
                        <span className="bl-box-tag" style={{ transform: `scale(${1 / zoom})` }} onPointerDown={popup ? (e) => startMove(e, p) : undefined}>{p.locked ? "🔒 " : ""}{part?.emoji} {p.name || part?.name}{p.hidden ? " (hidden)" : ""}{popup ? " · pop-up" : ""}</span>
                        {on && sel.length === 1 && !p.locked && handles.map((h) => (
                          <span key={h} className={`bl-handle ${h}`} style={{ "--hs": `${10 / zoom}px` } as CSSProperties} onPointerDown={(e) => startResize(e, p, h)} />
                        ))}
                        {on && sel.length === 1 && <span className="bl-size" style={{ transform: `translateX(-50%) scale(${1 / zoom})` }}>{round2(p.w)} × {round2(p.h)}</span>}
                      </div>
                    );
                  })}
                  {guides.v.map((x) => <span key={`v${x}`} className="bl-guide v" style={{ left: x, width: 1 / zoom }} />)}
                  {guides.h.map((y) => <span key={`h${y}`} className="bl-guide h" style={{ top: y, height: 1 / zoom }} />)}
                  {marquee && <span className="bl-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
                </div>
              )}
            </div>
          </div>
        ) : <div className="bl-empty-stage"><button className="bl-btn primary" onClick={() => setModal("start")}>Start a design</button></div>}
        {ctxMenu && (
          <div className="bl-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => { duplicateSel(); setCtxMenu(null); }}>⧉ Duplicate <kbd>Ctrl D</kbd></button>
            <button onClick={() => { clipboard.current = selected.map((p) => ({ ...p })); setCtxMenu(null); say("Copied"); }}>📋 Copy <kbd>Ctrl C</kbd></button>
            <button disabled={!clipboard.current.length} onClick={() => { paste(); setCtxMenu(null); }}>📥 Paste <kbd>Ctrl V</kbd></button>
            <hr />
            <button onClick={() => { layer("front"); setCtxMenu(null); }}>⤒ Bring to front <kbd>Ctrl ]</kbd></button>
            <button onClick={() => { layer("back"); setCtxMenu(null); }}>⤓ Send to back <kbd>Ctrl [</kbd></button>
            <hr />
            <button onClick={() => { updatePieces(sel, (p) => ({ ...p, locked: !p.locked })); setCtxMenu(null); }}>🔒 Lock / unlock</button>
            <button onClick={() => { updatePieces(sel, (p) => ({ ...p, hidden: !p.hidden })); setCtxMenu(null); }}>👁️ Hide / show</button>
            <button onClick={() => { align("pageCenter"); setCtxMenu(null); }}>↔ Centre on page</button>
            <hr />
            <button className="danger" onClick={() => { removeSel(); setCtxMenu(null); }}>🗑 Delete <kbd>Del</kbd></button>
          </div>
        )}
        {doc && (
          <div className="bl-hint">
            {device === "phone" ? "📲 On phones pieces stack top to bottom (small ones sit side by side). Switch to a bigger screen to move things."
              : mode === "try" ? "▶ Try it: click around like it's your real page. Press P (or ✏️ Edit) to go back to editing."
              : ctrlHeld ? "🎯 Free placement: no grid — pink lines show when edges line up."
              : "Drag to move · corners to resize · hold Ctrl to place freely · Shift-click to pick several · right-click for more"}
          </div>
        )}
      </main>

      {/* settings */}
      <aside className="bl-rightpanel">
        <div className="bl-scroll">
          {!doc ? <p className="bl-muted">Start a design to see its settings.</p> : selected.length > 1 ? multiSettings : one ? pieceSettings : pageSettings}
        </div>
      </aside>

      {toast && <div className="bl-toast" role="status">{toast}</div>}

      {/* start: pick where to begin */}
      {modal === "start" && (
        <div className="bl-modal-bg" onClick={() => doc && setModal("")}>
          <div className="bl-modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>🎨 Start a design</h2>
            <p className="bl-muted">Begin from a blank page or from any of the site&apos;s designs, already rebuilt out of pieces you can move.</p>
            <div className="bl-tpls">
              {TEMPLATE_LIST.map(([k, l, e]) => (
                <button key={k} className="bl-tpl" onClick={() => newFromTemplate(k)}>
                  <DesignMini d={templateDesign(k)} />
                  <strong>{e} {l}</strong>
                </button>
              ))}
            </div>
            {(lists?.mine.length || 0) > 0 && (
              <>
                <h3>Your designs</h3>
                <div className="bl-tpls">
                  {lists!.mine.map((d) => (
                    <button key={d.id} className="bl-tpl" onClick={() => openDoc(d)}>
                      <DesignMini d={d} />
                      <strong>{d.emoji} {d.name}</strong>
                      <em>{d.gallery === "approved" ? "🌍 In the gallery" : d.gallery === "pending" ? "⏳ Waiting for a check" : "Only you"}</em>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="bl-modal-foot">
              <button className="bl-btn ghost" onClick={() => { setGalleryTab("gallery"); setModal("gallery"); }}>🌍 Browse the gallery</button>
              {doc && <button className="bl-btn" onClick={() => setModal("")}>Back to my design</button>}
            </div>
          </div>
        </div>
      )}

      {/* designs: mine, the gallery, and (staff) ones waiting for a check */}
      {modal === "gallery" && (
        <div className="bl-modal-bg" onClick={() => setModal(doc ? "" : "start")}>
          <div className="bl-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="bl-modal-top">
              <h2>📚 Designs</h2>
              <div className="bl-seg">
                <button className={galleryTab === "mine" ? "on" : ""} onClick={() => setGalleryTab("mine")}>Mine ({lists?.mine.length || 0})</button>
                <button className={galleryTab === "gallery" ? "on" : ""} onClick={() => setGalleryTab("gallery")}>🌍 Gallery ({lists?.gallery.length || 0})</button>
                {staff && <button className={galleryTab === "pending" ? "on" : ""} onClick={() => setGalleryTab("pending")}>🛡️ To check ({lists?.pending?.length || 0})</button>}
              </div>
              <button className="bl-x big" onClick={() => setModal(doc ? "" : "start")} aria-label="Close">×</button>
            </div>
            <div className="bl-gallery">
              {(galleryTab === "mine" ? lists?.mine : galleryTab === "pending" ? lists?.pending : lists?.gallery)?.map((d) => (
                <div key={d.id} className="bl-gcard">
                  <DesignMini d={d} />
                  <div className="bl-gcard-body">
                    <strong>{d.emoji} {d.name}</strong>
                    <em>{galleryTab === "mine" ? (d.gallery === "approved" ? "🌍 Shared" : d.gallery === "pending" ? "⏳ Waiting for a check" : "🔒 Only you") : `by ${d.owner} · used ${d.uses || 0}×`}{lists?.siteDefault === d.id ? " · ⭐ site default" : ""}</em>
                    {d.description && <p>{d.description}</p>}
                    <div className="bl-gcard-actions">
                      {galleryTab === "mine" ? (
                        <>
                          <button className="bl-btn primary" onClick={() => openDoc(d)}>✏️ Edit</button>
                          <button className="bl-btn" onClick={async () => { await api("/api/designs", { action: "use", id: d.id }).catch(() => {}); if (window.opener && !window.opener.closed) { window.opener.postMessage({ type: "use-design", id: d.id }, location.origin); say("✅ It's on"); } else window.open(`/?design=${d.id}`, "_blank"); }}>Use</button>
                          <button className="bl-btn ghost" onClick={async () => { if (confirm(`Delete “${d.name}”?`)) { await galleryAction("delete", d.id, "Deleted"); if (docRef.current?.id === d.id) { docRef.current = null; setDocState(null); setModal("start"); } } }}>🗑</button>
                        </>
                      ) : galleryTab === "pending" ? (
                        <>
                          <button className="bl-btn primary" onClick={() => galleryAction("approve", d.id, "✅ Approved — it's in the gallery")}>✅ Approve</button>
                          <button className="bl-btn" onClick={() => galleryAction("reject", d.id, "Sent back — it stays private")}>✖ Not okay</button>
                          <button className="bl-btn ghost" onClick={() => window.open(`/?design=${d.id}`, "_blank")}>👀 Try it</button>
                        </>
                      ) : (
                        <>
                          <button className="bl-btn primary" onClick={async () => { await api("/api/designs", { action: "use", id: d.id }).catch(() => {}); refreshLists(); if (window.opener && !window.opener.closed) { window.opener.postMessage({ type: "use-design", id: d.id }, location.origin); say("✅ It's on — look at your other tab"); } else window.open(`/?design=${d.id}`, "_blank"); }}>Use it</button>
                          <button className="bl-btn" onClick={async () => { const r = await galleryAction("copy", d.id, "Copied — it's yours to change"); if (r?.saved) openDoc(r.saved); }}>⧉ Copy & edit</button>
                          {staff && <button className="bl-btn ghost" onClick={() => galleryAction("unshare", d.id, "Taken out of the gallery")}>Remove</button>}
                          {isAdmin && <button className="bl-btn ghost" title="New visitors start with this design" onClick={() => setSiteDefault(lists?.siteDefault === d.id ? "" : d.id)}>{lists?.siteDefault === d.id ? "★ Default" : "☆ Make default"}</button>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {((galleryTab === "mine" ? lists?.mine : galleryTab === "pending" ? lists?.pending : lists?.gallery)?.length || 0) === 0 && (
                <p className="bl-muted">{galleryTab === "mine" ? "You haven't made any designs yet." : galleryTab === "pending" ? "Nothing waiting — all checked! ✨" : "Nobody has shared a design yet — be the first! 🌍"}</p>
              )}
            </div>
            <div className="bl-modal-foot">
              <button className="bl-btn" onClick={() => setModal("start")}>➕ New design</button>
              {doc?.id && <button className="bl-btn ghost danger" onClick={deleteDoc}>🗑 Delete this design</button>}
            </div>
          </div>
        </div>
      )}

      {/* sharing */}
      {modal === "share" && doc && (
        <div className="bl-modal-bg" onClick={() => setModal("")}>
          <div className="bl-modal" onClick={(e) => e.stopPropagation()}>
            <h2>🌍 Share “{doc.name}”</h2>
            {doc.gallery === "approved" ? (
              <>
                <p>It&apos;s in the gallery — anyone can use it or make a copy. If you change it, a moderator checks it again first.</p>
                <button className="bl-btn" onClick={() => share(false)}>Take it out of the gallery</button>
              </>
            ) : doc.gallery === "pending" ? (
              <>
                <p>⏳ Waiting for a moderator to check it. It shows in the gallery once they say it&apos;s okay.</p>
                <button className="bl-btn" onClick={() => share(false)}>Cancel sharing</button>
              </>
            ) : (
              <>
                <p>Put your design in the gallery so other people can use it or make their own copy. A moderator checks it first (pictures and text follow the site rules).</p>
                <button className="bl-btn primary" onClick={() => share(true)}>🌍 Share to the gallery</button>
              </>
            )}
            {doc.id && (
              <>
                <h3>Link</h3>
                <p className="bl-muted">{doc.gallery === "approved" ? "Anyone with this link can switch to your design:" : "Works for other people once it's in the gallery:"}</p>
                <div className="bl-copyrow">
                  <input className="bl-input" readOnly value={`${location.origin}/?design=${doc.id}`} onFocus={(e) => e.target.select()} />
                  <button className="bl-btn" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/?design=${doc.id}`); say("Link copied 📋"); }}>Copy</button>
                </div>
              </>
            )}
            <div className="bl-modal-foot"><button className="bl-btn" onClick={() => setModal("")}>Done</button></div>
          </div>
        </div>
      )}

      {/* help */}
      {modal === "help" && (
        <div className="bl-modal-bg" onClick={() => setModal("")}>
          <div className="bl-modal" onClick={(e) => e.stopPropagation()}>
            <h2>❓ How it works</h2>
            <ul className="bl-help">
              <li><b>Add</b> — drag a part from the left onto the page (or click it).</li>
              <li><b>Move</b> — drag a piece. It snaps to the grid. <kbd>Ctrl</kbd> + drag places it anywhere, with pink lines when edges line up.</li>
              <li><b>Resize</b> — drag the little squares on its edges and corners (<kbd>Ctrl</kbd> for no snapping).</li>
              <li><b>Pick several</b> — <kbd>Shift</kbd>-click, or drag a box around them on an empty spot.</li>
              <li><b>Settings</b> — the right side changes colours, shape, font, options and layering of whatever&apos;s picked. With nothing picked, it changes the whole page.</li>
              <li><b>Try it</b> — ▶ Try it (or <kbd>P</kbd>) lets you click around your design for real.</li>
            </ul>
            <div className="bl-keys">
              {[["Ctrl Z / Ctrl Shift Z", "Undo / redo"], ["Ctrl D", "Duplicate"], ["Ctrl C / V / X", "Copy / paste / cut"], ["Del", "Delete"], ["Arrows", "Nudge (Shift = 4, Ctrl = tiny)"],
                ["[ ]", "Backward / forward"], ["Ctrl [ ]", "To back / to front"], ["Ctrl A", "Pick everything"], ["Ctrl Shift L / H", "Lock / hide"], ["G", "Grid lines on/off"],
                ["Ctrl + / − / 0", "Zoom in / out / fit"], ["Ctrl S", "Save now (it saves by itself too)"]].map(([k, v]) => <div key={k}><kbd>{k}</kbd><span>{v}</span></div>)}
            </div>
            <div className="bl-modal-foot"><button className="bl-btn primary" onClick={() => setModal("")}>Got it</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
