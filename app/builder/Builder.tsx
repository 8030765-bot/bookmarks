"use client";
import { CSSProperties, PointerEvent as RPointerEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUILT_IN_DESIGNS, BUTTON_ACTIONS, BuiltDesign, COLS, DEFAULT_CANVAS, DesignCanvas, DesignPiece, FONT_CHOICES, PARTS, PART_BY_ID, PART_FOLDERS, PartDef,
  PieceStyle, PropDef, PropValue, ROW, Sizing, TEMPLATE_LIST, makePiece, newPieceId, templateDesign,
} from "@/lib/pieces";
import { Rects, canvasRows, canvasStyle } from "../components/CustomCanvas";

/**
 * 🎨 The design builder — made to work like Figma.
 *   left   — the file (pages = screen sizes, and the layers) and the assets (every part)
 *   middle — an endless canvas you pan and zoom, with your real home page as the frame
 *   bottom — the toolbar: move, hand, frame (auto layout), shapes, text, assets, AI
 *   right  — Design (looks), Prototype (what buttons do) and ✨ AI
 * Pieces move freely, like in Figma, with red guides when edges line up;
 * turn on Snap to grid (Shift G) to lock them to the 24 columns. Holding
 * Ctrl (⌘) while dragging flips between the two. Shift A puts the picked pieces in an auto layout frame.
 */

type Draft = Omit<BuiltDesign, "id" | "owner" | "createdAt" | "updatedAt"> & { id?: string; owner?: string; createdAt?: string; updatedAt?: string };
type Me = { user: string | null; role: string | null };
type Lists = { staff: boolean; siteDefault: string; mine: BuiltDesign[]; gallery: BuiltDesign[]; pending?: BuiltDesign[] };
type FolderLite = { id: string; name: string; emoji: string };
type Device = "desktop" | "laptop" | "tablet" | "phone";
type Tool = "move" | "hand" | "frame" | "rect" | "ellipse" | "line" | "text";
type Box = { x: number; y: number; w: number; h: number };
type ChatMsg = { role: "user" | "assistant"; text: string; before?: Draft; error?: boolean };
type Usage = { limit: number; used: number; left: number | null; unlimited: boolean };

const DEVICES: { id: Device; label: string; icon: string; w: number }[] = [
  { id: "desktop", label: "Big screen", icon: "🖥️", w: 1440 },
  { id: "laptop", label: "Laptop", icon: "💻", w: 1280 },
  { id: "tablet", label: "Tablet", icon: "📱", w: 820 },
  { id: "phone", label: "Phone", icon: "📲", w: 390 },
];
const SWATCHES = ["#ffffff", "#0f1115", "#1c2030", "#7c6cff", "#4dabff", "#3dd68c", "#ffb84d", "#ff5c7a", "#e879f9", "#2dd4bf", "#f7f3ea", "#1d2330"];
const VIEWERS = ["viewer", "nova-page", "orbit-window", "journal-section", "term-dir"];
const ACTION_KEYS = ["action", "value", "folder", "section", "design", "newTab"];
const VIEWER_KEYS = ["mode", "look", "empty"];
const SNAP_PX = 6;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const capture = (e: RPointerEvent) => { try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {} };
const isTyping = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };

async function api<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong — try again");
  return j as T;
}

/** What kind of layer a part is, for its little icon (like Figma's layer icons). */
function layerIcon(p: DesignPiece, part?: PartDef) {
  if (!part) return "▫";
  if (part.id === "stack") return p.props?.dir === "column" ? "☰" : "⫼";
  if (["heading", "text", "title", "subtitle", "greeting"].includes(part.id)) return "T";
  if (["box", "glass", "gradient", "pattern"].includes(part.id)) return "▭";
  if (part.id === "circle" || part.id === "blob") return "○";
  if (part.id === "line" || part.id === "divider") return "╱";
  if (part.id === "image" || part.id === "bgimage") return "🖼";
  if (part.design) return "◈";
  if (part.folder === "Functions & buttons") return "◉";
  return "#";
}

/* ---------- a tiny drawing of a design, for lists and the gallery ---------- */
export function DesignMini({ d, className = "" }: { d: Pick<BuiltDesign, "canvas" | "pieces">; className?: string }) {
  const rows = 55;
  return (
    <div className={`fg-mini ${className}`} style={{ ...canvasStyle(d.canvas), aspectRatio: "16 / 11" } as CSSProperties}>
      {d.pieces.filter((p) => !p.hidden && !p.parent && p.y < rows).sort((a, b) => a.z - b.z).map((p) => {
        const part = PART_BY_ID.get(p.part);
        const tone = part?.design ? "design" : part?.folder === "Functions & buttons" ? "btn" : part?.deco ? "deco" : part?.folder === "Widgets" ? "widget" : "block";
        return (
          <span key={p.id} className={`fg-mini-p ${tone}`} style={{
            left: `${(p.x / COLS) * 100}%`, top: `${(p.y / rows) * 100}%`, width: `${(p.w / COLS) * 100}%`, height: `${(p.h / rows) * 100}%`,
            background: p.style?.bg || undefined, borderRadius: p.style?.radius !== undefined ? Math.min(p.style.radius, 99) / 4 : undefined,
          }} />
        );
      })}
    </div>
  );
}

/* ---------- Figma-style property controls ---------- */
function Field({ icon, value, onChange, min, max, step = 1, suffix, title, mixed }: {
  icon?: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; title?: string; mixed?: boolean;
}) {
  const [text, setText] = useState(mixed ? "Mixed" : String(value));
  useEffect(() => setText(mixed ? "Mixed" : String(value)), [value, mixed]);
  const commit = (t: string) => { const n = Number(t); if (Number.isFinite(n) && t.trim() !== "") onChange(clamp(n, min ?? -1e9, max ?? 1e9)); else setText(mixed ? "Mixed" : String(value)); };
  // drag the little label sideways to scrub the number, like Figma
  const scrub = (e: RPointerEvent) => {
    const start = e.clientX, v0 = value;
    capture(e);
    const move = (ev: PointerEvent) => onChange(clamp(round2(v0 + Math.round((ev.clientX - start) / 2) * step), min ?? -1e9, max ?? 1e9));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <label className="fg-field" title={title}>
      {icon !== undefined && <span className="fg-field-icon" onPointerDown={scrub}>{icon}</span>}
      <input value={text} inputMode="decimal" onChange={(e) => setText(e.target.value)} onBlur={(e) => commit(e.target.value)} onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onChange(clamp(round2(value + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)), min ?? -1e9, max ?? 1e9)); }
        }} />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}
function Swatch({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const six = value && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000";
  return (
    <span className="fg-swatch" style={{ "--sw": value || "transparent" } as CSSProperties}>
      <input type="color" value={six} onChange={(e) => onChange(e.target.value + (value && value.length === 9 ? value.slice(7) : ""))} aria-label="Pick a colour" />
    </span>
  );
}
function ColorRow({ value, onChange, onRemove, placeholder = "—" }: { value?: string; onChange: (v: string) => void; onRemove?: () => void; placeholder?: string }) {
  const [text, setText] = useState((value || "").replace("#", "").toUpperCase());
  const [pal, setPal] = useState(false);
  useEffect(() => setText((value || "").replace("#", "").toUpperCase()), [value]);
  return (
    <div className="fg-colorrow">
      <div className="fg-colorbox">
        <Swatch value={value} onChange={onChange} />
        <input className="fg-hex" value={text} placeholder={placeholder} spellCheck={false}
          onChange={(e) => { setText(e.target.value); const v = `#${e.target.value.replace("#", "").trim()}`; if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) onChange(v.toLowerCase()); }}
          onBlur={() => setText((value || "").replace("#", "").toUpperCase())} />
        <button className="fg-mini-btn" title="Colour palette" onClick={() => setPal(!pal)}>⋮</button>
      </div>
      {onRemove && <button className="fg-icon-btn" title="Remove" onClick={onRemove}>−</button>}
      {pal && (
        <div className="fg-palette">
          {SWATCHES.map((c) => <button key={c} style={{ background: c }} title={c} onClick={() => { onChange(c); setPal(false); }} />)}
        </div>
      )}
    </div>
  );
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="fg-check">
      <button type="button" role="switch" aria-checked={on} className={`fg-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span /></button>
      {label && <span>{label}</span>}
    </label>
  );
}
function Seg<T extends string>({ value, options, onChange, title }: { value: T; options: [T, ReactNode, string?][]; onChange: (v: T) => void; title?: string }) {
  return (
    <div className="fg-seg" role="group" aria-label={title}>
      {options.map(([v, l, tip]) => <button key={v} title={tip} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
function Panel({ title, children, action, open: startOpen = true }: { title: string; children?: ReactNode; action?: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section className={`fg-sec ${open ? "open" : ""}`}>
      <div className="fg-sec-head">
        <button onClick={() => setOpen(!open)}>{title}</button>
        <span>{action}</span>
      </div>
      {open && children && <div className="fg-sec-body">{children}</div>}
    </section>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fg-row"><span>{label}</span><div>{children}</div></div>;
}

/* ---------- Quick actions (Ctrl K): find any command or part by typing ---------- */
type Action = { id: string; label: string; icon?: string; kbd?: string; group: string; run: () => void; off?: boolean };
function QuickActions({ items, onClose }: { items: Action[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((a) => !a.off && words.every((w) => `${a.label} ${a.group}`.toLowerCase().includes(w))).slice(0, 60);
  useEffect(() => setAt(0), [text]);
  useEffect(() => { listRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }, [at]);
  const go = (a?: Action) => { if (!a) return; onClose(); a.run(); };
  return (
    <div className="fg-modal-bg fg-qa-bg" onPointerDown={onClose}>
      <div className="fg-qa" onPointerDown={(e) => e.stopPropagation()}>
        <input autoFocus className="fg-qa-input" placeholder="Search actions and parts…  (try “align”, “clock”, “snap”)" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(shown.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); go(shown[at]); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }} />
        <div className="fg-qa-list" ref={listRef}>
          {shown.length === 0 && <p className="fg-muted pad small">Nothing matches.</p>}
          {shown.map((a, i) => (
            <button key={a.id} className={i === at ? "on" : ""} onPointerEnter={() => setAt(i)} onClick={() => go(a)}>
              <span className="fg-qa-icon">{a.icon || "›"}</span>{a.label}<em>{a.group}</em>{a.kbd && <kbd>{a.kbd}</kbd>}
            </button>
          ))}
        </div>
      </div>
    </div>
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
  const [device, setDeviceState] = useState<Device>("laptop");
  const setDevice = (d: Device) => { setDeviceState(d); try { localStorage.setItem("builder:device", d); } catch {} };
  useEffect(() => { try { const d = localStorage.getItem("builder:device"); if (d && DEVICES.some((x) => x.id === d)) setDeviceState(d as Device); } catch {} }, []);
  const [cam, setCam] = useState({ x: 0, y: 0, z: 0.6 });
  const [animate, setAnimate] = useState(false);
  const [tool, setTool] = useState<Tool>("move");
  const [shapeMenu, setShapeMenu] = useState(false);
  const [mode, setMode] = useState<"edit" | "try">("edit");
  const [leftTab, setLeftTab] = useState<"file" | "assets">("file");
  const [rightTab, setRightTab] = useState<"design" | "prototype" | "ai">("design");
  const [q, setQ] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(["Basic blocks", "Widgets"]));
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"" | "start" | "gallery" | "help" | "share">("");
  const [galleryTab, setGalleryTab] = useState<"gallery" | "mine" | "pending">("gallery");
  const [menu, setMenu] = useState<"" | "main" | "zoom">("");
  const [ready, setReady] = useState(0);
  const [rects, setRects] = useState<Rects>({});
  const [pageH, setPageH] = useState(0);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [drawBox, setDrawBox] = useState<Box | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; empty?: boolean; wx?: number; wy?: number } | null>(null);
  const [dragging, setDragging] = useState<"" | "move" | "resize" | "rotate">("");
  const [palette, setPalette] = useState(false);
  const [layerQ, setLayerQ] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  // free movement is the default; snapping to the columns is opt-in (remembered on this device)
  const [snap, setSnapState] = useState(false);
  useEffect(() => { try { setSnapState(localStorage.getItem("builder:snap") === "1"); } catch {} }, []);
  const setSnap = (on: boolean) => { setSnapState(on); try { localStorage.setItem("builder:snap", on ? "1" : "0"); } catch {} };
  const [previewState, setPreviewState] = useState<"home" | "folder" | "search">("home");
  const [keys, setKeys] = useState({ ctrl: false, space: false, alt: false });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dropInto, setDropInto] = useState<{ stack: string; index: number; line: Box } | null>(null);
  const [ghost, setGhost] = useState<Box | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const clipboard = useRef<DesignPiece[]>([]);
  const styleClip = useRef<PieceStyle | null>(null);
  /** where the mouse is on the page (for pasting there), or null when it's off the canvas */
  const mouseAt = useRef<{ px: number; py: number } | null>(null);
  const layerDrag = useRef("");
  const toastTimer = useRef<number>();
  const say = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 2800); }, []);

  /* ---------- loading ---------- */
  const refreshLists = useCallback(() => api<Lists>("/api/designs").then(setLists).catch(() => {}), []);
  useEffect(() => {
    api<Me>("/api/auth").then((m) => setMe({ user: m.user, role: m.role })).catch(() => setMe({ user: null, role: null }));
    refreshLists();
    api<{ folders?: FolderLite[] }>("/api/bookmarks").then((d) => setFolders((d.folders || []).map((f) => ({ id: f.id, name: f.name, emoji: f.emoji })))).catch(() => {});
    document.title = "Design builder";
  }, [refreshLists]);
  useEffect(() => { if (me?.user) api<Usage>("/api/designs/ai").then(setUsage).catch(() => {}); }, [me]);

  /* ---------- the document, with undo ---------- */
  const setDoc = useCallback((next: Draft | null, opts: { history?: boolean; before?: Draft | null } = {}) => {
    const prev = opts.before !== undefined ? opts.before : docRef.current;
    docRef.current = next;
    setDocState(next);
    if (opts.history !== false && prev && next) { setPast((p) => [...p.slice(-99), prev]); setFuture([]); }
    if (next) setDirty(true);
  }, []);
  const change = useCallback((fn: (d: Draft) => Draft, history = true) => {
    const cur = docRef.current;
    if (cur) setDoc(fn(cur), { history });
  }, [setDoc]);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length || !docRef.current) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [docRef.current!, ...f]);
      docRef.current = prev; setDocState(prev); setDirty(true);
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length || !docRef.current) return f;
      const next = f[0];
      setPast((p) => [...p, docRef.current!]);
      docRef.current = next; setDocState(next); setDirty(true);
      return f.slice(1);
    });
  }, []);

  /* ---------- the camera: an endless canvas you pan and zoom ---------- */
  const deviceW = DEVICES.find((d) => d.id === device)!.w;
  const colW = deviceW / COLS;
  const rows = doc ? canvasRows(doc) : 60;
  const frameH = device === "phone" ? Math.max(800, pageH) : Math.max((rows + 12) * ROW, pageH);
  const camRef = useRef(cam);
  camRef.current = cam;
  const moveCam = useCallback((next: { x: number; y: number; z: number }, smooth = false) => {
    setAnimate(smooth);
    setCam({ x: next.x, y: next.y, z: clamp(next.z, 0.05, 4) });
    if (smooth) window.setTimeout(() => setAnimate(false), 260);
  }, []);
  const fit = useCallback((smooth = true) => {
    const el = stageRef.current;
    if (!el) return;
    const z = clamp((el.clientWidth - 120) / deviceW, 0.08, 1);
    moveCam({ z, x: (el.clientWidth - deviceW * z) / 2, y: 56 }, smooth);
  }, [deviceW, moveCam]);
  useEffect(() => { fit(true); }, [device, fit]);
  const zoomAt = useCallback((factor: number, sx?: number, sy?: number, smooth = false) => {
    const el = stageRef.current;
    if (!el) return;
    const c = camRef.current;
    const px = sx ?? el.clientWidth / 2, py = sy ?? el.clientHeight / 2;
    const z = clamp(c.z * factor, 0.05, 4);
    // keep the point under the cursor still
    moveCam({ z, x: px - ((px - c.x) / c.z) * z, y: py - ((py - c.y) / c.z) * z }, smooth);
  }, [moveCam]);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".fg-menu")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      else {
        const c = camRef.current;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        moveCam({ ...c, x: c.x - dx, y: c.y - dy });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, moveCam, doc]);

  function openDoc(d: Draft) {
    docRef.current = d;
    setDocState(d);
    setPast([]); setFuture([]); setSel([]); setChat([]);
    setDirty(!d.id);
    setModal("");
    if (d.id) history.replaceState(null, "", `/builder?id=${d.id}`);
    window.setTimeout(() => fit(false), 30);
  }
  useEffect(() => {
    if (!me?.user || doc) return;
    const id = new URLSearchParams(location.search).get("id");
    if (id) {
      api<{ design: BuiltDesign }>(`/api/designs?id=${id}`).then(({ design }) => {
        if (design.owner === me.user!.toLowerCase()) openDoc(design);
        else { openDoc({ name: `${design.name} (copy)`, emoji: design.emoji, canvas: design.canvas, pieces: design.pieces }); say("This is someone else's design — you're editing your own copy"); }
      }).catch(() => setModal("start"));
    } else setModal("start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  /* ---------- saving (by itself, a moment after each change) ---------- */
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

  /* ---------- the live preview (your real home page, inside the frame) ---------- */
  const post = useCallback((msg: unknown) => iframeRef.current?.contentWindow?.postMessage(msg, location.origin), []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === "preview-ready") setReady((n) => n + 1);
      if (e.data?.type === "preview-rects") { setRects(e.data.rects || {}); setPageH(Number(e.data.h) || 0); }
      if (e.data?.type === "preview-height" && typeof e.data.h === "number") setPageH((h) => Math.max(h, e.data.h));
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
    post({ type: "design-section", section: previewState === "folder" && folders[0] ? `folder:${folders[0].id}` : "home", search: previewState === "search" ? "a" : "" });
  }, [previewState, ready, folders, post]);

  /* ---------- pieces ---------- */
  const pieces = useMemo(() => doc?.pieces || [], [doc]);
  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const childrenOf = useCallback((id: string) => pieces.filter((p) => p.parent === id), [pieces]);
  const selected = pieces.filter((p) => sel.includes(p.id));
  const one = selected.length === 1 ? selected[0] : null;
  const maxZ = () => Math.max(0, ...(docRef.current?.pieces || []).map((p) => p.z));
  /** where a piece is on the frame, in pixels (frames place their pieces, so those come from the page) */
  const rectOf = useCallback((p: DesignPiece): Box | null => {
    if (p.parent || p.sizeW === "hug" || p.sizeH === "hug") {
      const r = rects[p.id];
      if (r) return r;
      if (p.parent) return null;
    }
    return { x: p.x * colW, y: p.y * ROW, w: p.w * colW, h: p.h * ROW };
  }, [rects, colW]);
  const descendants = useCallback((id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (pid: string) => { for (const c of pieces) if (c.parent === pid && !out.has(c.id)) { out.add(c.id); walk(c.id); } };
    walk(id);
    return out;
  }, [pieces]);
  /** a piece and everything inside it */
  const withKids = (ids: string[]) => { const all = new Set(ids); for (const id of ids) descendants(id).forEach((c) => all.add(c)); return all; };
  const updatePieces = (ids: string[], fn: (p: DesignPiece) => DesignPiece, history = true) =>
    change((d) => ({ ...d, pieces: d.pieces.map((p) => (ids.includes(p.id) ? fn(p) : p)) }), history);
  const setProp = (id: string, key: string, v: PropValue) => updatePieces([id], (p) => ({ ...p, props: { ...p.props, [key]: v } }));
  const setStyle = (ids: string[], patch: Partial<PieceStyle>) => updatePieces(ids, (p) => {
    const style: PieceStyle = { ...(p.style || {}), ...patch };
    for (const k of Object.keys(style) as (keyof PieceStyle)[]) if (style[k] === undefined) delete style[k];
    return { ...p, style };
  });
  /** the first empty spot, from the top of what you're looking at */
  function freeSpot(w: number, h: number): { x: number; y: number } {
    const from = Math.max(0, Math.floor(((-camRef.current.y + 40) / camRef.current.z) / ROW));
    const solid = (docRef.current?.pieces || []).filter((o) => !o.hidden && !o.parent && !PART_BY_ID.get(o.part)?.deco && !(VIEWERS.includes(o.part) && o.props?.mode !== "inline"));
    const free = (cx: number, cy: number) => solid.every((o) => cx + w <= o.x || cx >= o.x + o.w || cy + h <= o.y || cy >= o.y + o.h);
    for (let cy = from; cy < from + 400; cy++) for (let cx = 0; cx <= COLS - Math.min(w, COLS); cx++) if (free(cx, cy)) return { x: cx, y: cy };
    return { x: (COLS - w) / 2, y: from + 2 };
  }
  function addPart(partId: string, at?: { x: number; y: number }, size?: { w: number; h: number }) {
    const part = PART_BY_ID.get(partId);
    if (!part || !docRef.current) return;
    const w = size?.w ?? part.w, h = size?.h ?? part.h;
    const spot = at ? { x: at.x - (size ? 0 : w / 2), y: at.y - (size ? 0 : h / 2) } : freeSpot(w, h);
    const p = makePiece(partId, clamp(size ? spot.x : Math.round(spot.x), 0, COLS - Math.min(w, COLS)), Math.max(0, size ? spot.y : Math.round(spot.y)), maxZ() + 1, { w, h });
    change((d) => ({ ...d, pieces: [...d.pieces, p] }));
    setSel([p.id]);
    setMode("edit");
    return p;
  }
  const removeSel = () => {
    const ids = selected.filter((p) => !p.locked).map((p) => p.id);
    if (!ids.length) { if (selected.length) say("🔒 Unlock it first"); return; }
    const gone = withKids(ids);
    change((d) => ({ ...d, pieces: d.pieces.filter((p) => !gone.has(p.id)) }));
    setSel([]);
  };
  /** copies of pieces (with whatever's inside frames), with new ids */
  function cloneSet(list: DesignPiece[], dx: number, dy: number) {
    const all = Array.from(withKids(list.map((p) => p.id))).map((id) => byId.get(id) || list.find((p) => p.id === id)!).filter(Boolean);
    const ids = new Map(all.map((p) => [p.id, newPieceId()]));
    let z = maxZ();
    const roots = new Set(list.map((p) => p.id));
    const copies = all.map((p) => ({
      ...p, id: ids.get(p.id)!, z: ++z, locked: undefined,
      parent: p.parent && ids.has(p.parent) ? ids.get(p.parent) : p.parent && byId.has(p.parent) ? p.parent : undefined,
      ...(roots.has(p.id) && !p.parent ? { x: clamp(p.x + dx, 0, COLS - p.w), y: p.y + dy } : {}),
    }));
    return { copies, rootIds: list.map((p) => ids.get(p.id)!) };
  }
  const duplicateSel = () => {
    if (!selected.length) return;
    const { copies, rootIds } = cloneSet(selected, 1, 2);
    change((d) => {
      const out = [...d.pieces];
      for (const c of copies) {
        // a copy of something inside a frame goes right after the original
        const i = rootIds.indexOf(c.id);
        const src = i >= 0 ? selected[i] : undefined;
        const at = src?.parent ? out.findIndex((x) => x.id === src.id) + 1 : out.length;
        out.splice(at, 0, c);
      }
      return { ...d, pieces: out };
    });
    setSel(rootIds);
  };
  /** Ctrl V pastes where the mouse is (or just below the original); Ctrl Shift V pastes in place */
  const paste = (where: "mouse" | "inplace" | { px: number; py: number } = "mouse") => {
    const list = clipboard.current;
    if (!list.length) return;
    let dx = 0, dy = where === "inplace" ? 0 : 2;
    const at = typeof where === "object" ? where : where === "mouse" ? mouseAt.current : null;
    const tops = list.filter((p) => !p.parent);
    if (at && tops.length) {
      const minX = Math.min(...tops.map((p) => p.x)), maxR = Math.max(...tops.map((p) => p.x + p.w));
      const minY = Math.min(...tops.map((p) => p.y)), maxB = Math.max(...tops.map((p) => p.y + p.h));
      dx = round2(at.px / colW - (minX + maxR) / 2); dy = round2(Math.max(-minY, at.py / ROW - (minY + maxB) / 2));
    }
    const { copies, rootIds } = cloneSet(list, dx, dy);
    change((d) => ({ ...d, pieces: [...d.pieces, ...copies] }));
    setSel(rootIds);
  };
  const layer = (how: "front" | "back" | "up" | "down") => {
    if (!selected.length || !docRef.current) return;
    const order = [...docRef.current.pieces].filter((p) => !p.parent).sort((a, b) => a.z - b.z).map((p) => p.id);
    const ids = new Set(sel);
    let next = order.filter((id) => !ids.has(id));
    const picked = order.filter((id) => ids.has(id));
    if (how === "front") next = [...next, ...picked];
    else if (how === "back") next = [...picked, ...next];
    else {
      next = [...order];
      for (const id of how === "up" ? [...picked].reverse() : picked) {
        const i = next.indexOf(id), j = how === "up" ? i + 1 : i - 1;
        if (j < 0 || j >= next.length || ids.has(next[j])) continue;
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    const z = new Map(next.map((id, i) => [id, i + 1]));
    change((d) => ({ ...d, pieces: d.pieces.map((p) => ({ ...p, z: z.get(p.id) || p.z })) }));
  };
  const align = (how: "left" | "center" | "right" | "top" | "middle" | "bottom" | "hdist" | "vdist") => {
    const list = selected.filter((p) => !p.parent && !p.locked);
    if (!list.length) return;
    // one piece lines up with the page; several line up with each other
    const minX = list.length === 1 ? 0 : Math.min(...list.map((p) => p.x)), maxR = list.length === 1 ? COLS : Math.max(...list.map((p) => p.x + p.w));
    const minY = Math.min(...list.map((p) => p.y)), maxB = Math.max(...list.map((p) => p.y + p.h));
    const ids = list.map((p) => p.id);
    if (how === "hdist" || how === "vdist") {
      const sorted = [...list].sort((a, b) => (how === "hdist" ? a.x - b.x : a.y - b.y));
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
        case "top": return list.length === 1 ? p : { ...p, y: minY };
        case "bottom": return list.length === 1 ? p : { ...p, y: round2(maxB - p.h) };
        case "middle": return list.length === 1 ? p : { ...p, y: round2((minY + maxB) / 2 - p.h / 2) };
        default: return p;
      }
    });
  };

  const copyStyle = () => {
    if (!one) return;
    styleClip.current = { ...(one.style || {}) };
    say("🎨 Style copied — Ctrl Alt V pastes it onto other pieces");
  };
  const pasteStyle = () => {
    const st = styleClip.current;
    if (!st || !selected.length) return;
    // phone visibility and turning stay as they were: they aren't part of its look
    const { phone: _p, rotate: _r, ...look } = st;
    void _p; void _r;
    updatePieces(sel, (p) => {
      const keep = { ...(p.style?.phone ? { phone: p.style.phone } : {}), ...(p.style?.rotate ? { rotate: p.style.rotate } : {}) };
      const next = { ...look, ...keep };
      return { ...p, style: Object.keys(next).length ? next : undefined };
    });
    say("🎨 Style pasted");
  };
  const selectMatching = () => {
    if (!one) return;
    const same = pieces.filter((p) => p.part === one.part && !p.hidden).map((p) => p.id);
    setSel(same);
    say(`Picked ${same.length} like this`);
  };
  /** turn the picked pieces (to an angle, or by some degrees) */
  const rotateSel = (by: number | null) => updatePieces(sel, (p) => {
    let d = by === null ? 0 : (p.style?.rotate || 0) + by;
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    if (d === -180) d = 180;
    return { ...p, style: { ...(p.style || {}), rotate: d ? round2(d) : undefined } };
  });
  /** Tidy up: line the picked pieces up in a neat grid, in reading order */
  const tidyUp = () => {
    const list = selected.filter((p) => !p.parent && !p.locked);
    if (list.length < 2) { say("Pick two or more pieces to tidy up"); return; }
    // group into rows: pieces whose middles are near each other's height share a row
    const sorted = [...list].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
    const rowsOf: DesignPiece[][] = [];
    for (const p of sorted) {
      const last = rowsOf[rowsOf.length - 1];
      if (last && Math.abs(p.y + p.h / 2 - (last[0].y + last[0].h / 2)) < Math.max(p.h, last[0].h) / 2) last.push(p);
      else rowsOf.push([p]);
    }
    rowsOf.forEach((r) => r.sort((a, b) => a.x - b.x));
    const gapX = round2(16 / colW), gapY = 1;
    const minX = Math.min(...list.map((p) => p.x));
    let y = Math.min(...list.map((p) => p.y));
    const pos = new Map<string, { x: number; y: number }>();
    for (const r of rowsOf) {
      let x = minX;
      for (const p of r) { pos.set(p.id, { x: round2(clamp(x, 0, COLS - p.w)), y: round2(y) }); x += p.w + gapX; }
      y += Math.max(...r.map((p) => p.h)) + gapY;
    }
    updatePieces(list.map((p) => p.id), (p) => ({ ...p, ...pos.get(p.id)! }));
    say("✨ Tidied up");
  };
  /** Tab / Shift Tab: pick the next piece (in reading order, among its neighbours) */
  const cycle = (back: boolean) => {
    const parent = one?.parent;
    const sibs = pieces.filter((p) => !p.hidden && (parent ? p.parent === parent : !p.parent || !byId.has(p.parent)));
    if (!sibs.length) return;
    const ordered = parent ? sibs : [...sibs].sort((a, b) => a.y - b.y || a.x - b.x);
    const i = one ? ordered.findIndex((p) => p.id === one.id) : -1;
    const next = ordered[(i + (back ? -1 : 1) + ordered.length) % ordered.length];
    setSel([next.id]);
  };

  /* ---------- auto layout (Shift A) ---------- */
  function addAutoLayout() {
    const list = selected.filter((p) => !p.locked);
    if (!list.length) { if (addPart("stack")) say("⬚ Auto layout frame added — drop pieces into it"); return; }
    const parent = list[0].parent;
    const same = list.filter((p) => p.parent === parent);
    const boxes = same.map((p) => ({ p, b: rectOf(p) || { x: p.x * colW, y: p.y * ROW, w: p.w * colW, h: p.h * ROW } }));
    const minX = Math.min(...boxes.map((x) => x.b.x)), minY = Math.min(...boxes.map((x) => x.b.y));
    const maxR = Math.max(...boxes.map((x) => x.b.x + x.b.w)), maxB = Math.max(...boxes.map((x) => x.b.y + x.b.h));
    const spreadX = maxR - minX - Math.max(...boxes.map((x) => x.b.w)), spreadY = maxB - minY - Math.max(...boxes.map((x) => x.b.h));
    const dir = spreadX >= spreadY ? "row" : "column";
    const ordered = [...boxes].sort((a, b) => (dir === "row" ? a.b.x - b.b.x : a.b.y - b.b.y));
    // keep roughly the gap they already had
    let gap = 12;
    if (ordered.length > 1) {
      const gaps = ordered.slice(1).map((x, i) => (dir === "row" ? x.b.x - (ordered[i].b.x + ordered[i].b.w) : x.b.y - (ordered[i].b.y + ordered[i].b.h)));
      gap = clamp(Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length), 0, 120);
    }
    const frame = makePiece("stack", round2(minX / colW), round2(minY / ROW), Math.max(...same.map((p) => p.z)), {
      w: round2((maxR - minX) / colW), h: round2((maxB - minY) / ROW), parent,
    });
    frame.props = { ...frame.props, dir, gap, pad: 0, align: "start" };
    if (parent) { frame.sizeW = "fixed"; frame.sizeH = "fixed"; }
    const ids = new Set(same.map((p) => p.id));
    change((d) => {
      const rest = d.pieces.filter((p) => !ids.has(p.id));
      const at = Math.min(...same.map((p) => d.pieces.findIndex((x) => x.id === p.id)));
      const kids = ordered.map(({ p, b }) => ({ ...p, parent: frame.id, w: round2(b.w / colW), h: round2(b.h / ROW), sizeW: p.sizeW || "fixed" as Sizing, sizeH: p.sizeH || "fixed" as Sizing }));
      rest.splice(Math.min(at, rest.length), 0, frame, ...kids);
      return { ...d, pieces: rest };
    });
    setSel([frame.id]);
    say(`⬚ Auto layout ${dir === "row" ? "→ across" : "↓ down"} — drag pieces in or out of it`);
  }
  function removeAutoLayout(stackId: string) {
    const st = byId.get(stackId);
    if (!st) return;
    const kids = childrenOf(stackId);
    change((d) => ({
      ...d,
      pieces: d.pieces.filter((p) => p.id !== stackId).map((p) => {
        if (p.parent !== stackId) return p;
        const r = rects[p.id];
        if (st.parent) return { ...p, parent: st.parent };
        return { ...p, parent: undefined, sizeW: undefined, sizeH: undefined, x: r ? round2(clamp(r.x / colW, 0, COLS - p.w)) : st.x, y: r ? round2(r.y / ROW) : st.y, z: st.z };
      }),
    }));
    setSel(kids.map((k) => k.id));
  }
  /** put a piece into a frame, at a spot among its pieces */
  const insertInto = (d: Draft, piece: DesignPiece, stack: string, index: number): Draft => {
    const rest = d.pieces.filter((x) => x.id !== piece.id);
    const sibs = rest.filter((x) => x.parent === stack);
    const after = sibs[index];
    const at = after ? rest.findIndex((x) => x.id === after.id) : sibs.length ? rest.findIndex((x) => x.id === sibs[sibs.length - 1].id) + 1 : rest.findIndex((x) => x.id === stack) + 1;
    rest.splice(at, 0, { ...piece, parent: stack, sizeW: piece.sizeW || "fixed", sizeH: piece.sizeH || "fixed" });
    return { ...d, pieces: rest };
  };

  /* ---------- the canvas: drag, resize, draw, box-select, pan ---------- */
  type Drag = {
    kind: "move" | "resize" | "marquee" | "pan" | "draw" | "child" | "rotate";
    dir?: string; sx: number; sy: number; start: Map<string, DesignPiece>; before: Draft; moved: boolean; additive?: boolean;
    cam?: { x: number; y: number }; startBox?: Box;
    /** Alt-drag made copies: undo goes back to before they existed */
    undoTo?: Draft; dupOf?: string[];
    /** turning: the middle of the piece, the angle it started at and where the mouse started */
    cx?: number; cy?: number; rot0?: number; a0?: number;
  };
  const drag = useRef<Drag | null>(null);
  const toWorld = (clientX: number, clientY: number) => {
    const el = overlayRef.current || stageRef.current!;
    const r = el.getBoundingClientRect();
    return overlayRef.current ? { px: (clientX - r.left) / cam.z, py: (clientY - r.top) / cam.z } : { px: (clientX - r.left - cam.x) / cam.z, py: (clientY - r.top - cam.y) / cam.z };
  };
  /** which auto layout frame (and where in it) a point is over */
  function frameAt(px: number, py: number, skip: Set<string>): { stack: string; index: number; line: Box } | null {
    const stacks = pieces.filter((p) => p.part === "stack" && !p.hidden && !skip.has(p.id)).map((p) => ({ p, r: rectOf(p) }))
      .filter((x) => x.r && px >= x.r.x && px <= x.r.x + x.r.w && py >= x.r.y && py <= x.r.y + x.r.h);
    if (!stacks.length) return null;
    // the innermost one
    stacks.sort((a, b) => a.r!.w * a.r!.h - b.r!.w * b.r!.h);
    const { p: st, r } = stacks[0];
    const row = st.props?.dir !== "column";
    const kids = childrenOf(st.id).filter((k) => !skip.has(k.id)).map((k) => ({ k, r: rects[k.id] })).filter((x) => x.r);
    let index = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const kr = kids[i].r!;
      if (row ? px < kr.x + kr.w / 2 : py < kr.y + kr.h / 2) { index = i; break; }
    }
    const pad = Number(st.props?.pad ?? 12);
    const before = kids[index - 1]?.r, after = kids[index]?.r;
    const line: Box = row
      ? { x: after ? after.x - 2 : before ? before.x + before.w + 1 : r!.x + pad, y: r!.y + 4, w: 2 / cam.z, h: r!.h - 8 }
      : { x: r!.x + 4, y: after ? after.y - 2 : before ? before.y + before.h + 1 : r!.y + pad, w: r!.w - 8, h: 2 / cam.z };
    return { stack: st.id, index, line };
  }
  function startPan(e: RPointerEvent) {
    capture(e);
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, start: new Map(), before: docRef.current!, moved: false, cam: { x: cam.x, y: cam.y } };
  }
  function startMove(e: RPointerEvent, p: DesignPiece) {
    if (mode !== "edit" || e.button === 2) return;
    if (e.button === 1 || keys.space || tool === "hand") { e.stopPropagation(); startPan(e); return; }
    if (tool !== "move") return;
    e.stopPropagation();
    setCtxMenu(null); setMenu("");
    // clicking a piece inside a frame picks the frame first, then (click again) the piece — like Figma
    let target = p;
    if (p.parent && !sel.includes(p.id) && !e.ctrlKey && !e.metaKey) {
      let top = p;
      while (top.parent && byId.get(top.parent) && !sel.includes(top.parent) && !sel.some((s) => byId.get(s)?.parent === top.parent)) top = byId.get(top.parent)!;
      target = top;
    }
    let ids = sel;
    if (e.shiftKey) { ids = sel.includes(target.id) ? sel.filter((x) => x !== target.id) : [...sel, target.id]; setSel(ids); return; }
    if (!sel.includes(target.id)) { ids = [target.id]; setSel(ids); }
    capture(e);
    if (target.locked) return;
    if (target.parent) {
      drag.current = { kind: "child", sx: e.clientX, sy: e.clientY, start: new Map([[target.id, target]]), before: docRef.current!, moved: false, startBox: rectOf(target) || undefined };
      return;
    }
    const movable = pieces.filter((x) => ids.includes(x.id) && !x.locked && !x.parent);
    if (!movable.length) return;
    if (e.altKey) {
      // Alt-drag: leave the originals and drag copies, like Figma
      const before = docRef.current!;
      const { copies, rootIds } = cloneSet(movable, 0, 0);
      const next = { ...before, pieces: [...before.pieces, ...copies] };
      setDoc(next, { history: false });
      setSel(rootIds);
      drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, start: new Map(copies.filter((c) => rootIds.includes(c.id)).map((c) => [c.id, c])), before: next, moved: false, undoTo: before, dupOf: movable.map((x) => x.id) };
      return;
    }
    drag.current = { kind: "move", sx: e.clientX, sy: e.clientY, start: new Map(movable.map((x) => [x.id, x])), before: docRef.current!, moved: false };
  }
  function startRotate(e: RPointerEvent, p: DesignPiece) {
    if (mode !== "edit" || p.locked) return;
    e.stopPropagation();
    capture(e);
    const r = rectOf(p);
    if (!r) return;
    const { px, py } = toWorld(e.clientX, e.clientY);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    drag.current = { kind: "rotate", sx: e.clientX, sy: e.clientY, start: new Map([[p.id, p]]), before: docRef.current!, moved: false, cx, cy, rot0: p.style?.rotate || 0, a0: Math.atan2(py - cy, px - cx) };
  }
  function startResize(e: RPointerEvent, p: DesignPiece, dir: string) {
    if (mode !== "edit" || p.locked) return;
    e.stopPropagation();
    capture(e);
    const r = rectOf(p);
    // a piece inside a frame (or one that hugs) starts from where it really is
    const base = p.parent || p.sizeW === "hug" || p.sizeH === "hug" ? { ...p, w: r ? round2(r.w / colW) : p.w, h: r ? round2(r.h / ROW) : p.h } : p;
    drag.current = { kind: "resize", dir, sx: e.clientX, sy: e.clientY, start: new Map([[p.id, base]]), before: docRef.current!, moved: false };
  }
  function onStageDown(e: RPointerEvent) {
    if ((e.target as HTMLElement).closest(".fg-toolbar,.fg-menu,.fg-previewsel")) return;
    setCtxMenu(null); setMenu(""); setShapeMenu(false);
    if (e.button === 1 || keys.space || tool === "hand") { startPan(e); return; }
    if (mode !== "edit" || e.button !== 0 || !docRef.current) return;
    const { px, py } = toWorld(e.clientX, e.clientY);
    if (tool !== "move") {
      capture(e);
      drag.current = { kind: "draw", sx: px, sy: py, start: new Map(), before: docRef.current!, moved: false };
      setDrawBox({ x: px, y: py, w: 0, h: 0 });
      return;
    }
    capture(e);
    drag.current = { kind: "marquee", sx: px, sy: py, start: new Map(), before: docRef.current!, moved: false, additive: e.shiftKey };
    if (!e.shiftKey) setSel([]);
  }
  /** free placement: line edges up with other pieces (and the page's middle) */
  function snapToGuides(box: Box, skip: Set<string>) {
    const xs: number[] = [deviceW / 2, 0, deviceW], ys: number[] = [];
    for (const o of pieces) {
      if (skip.has(o.id) || o.hidden) continue;
      const r = rectOf(o);
      if (!r) continue;
      xs.push(r.x, r.x + r.w / 2, r.x + r.w);
      ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    }
    const lim = SNAP_PX / cam.z;
    let dx = 0, dy = 0, bx = lim + 1, by = lim + 1;
    for (const edge of [box.x, box.x + box.w / 2, box.x + box.w]) for (const x of xs) { const d = x - edge; if (Math.abs(d) < Math.abs(bx) && Math.abs(d) <= lim) { bx = d; dx = d; } }
    for (const edge of [box.y, box.y + box.h / 2, box.y + box.h]) for (const y of ys) { const d = y - edge; if (Math.abs(d) < Math.abs(by) && Math.abs(d) <= lim) { by = d; dy = d; } }
    const gv = Math.abs(bx) <= lim ? xs.filter((x) => [box.x + dx, box.x + dx + box.w / 2, box.x + dx + box.w].some((e2) => Math.abs(x - e2) < 0.5)) : [];
    const gh = Math.abs(by) <= lim ? ys.filter((y) => [box.y + dy, box.y + dy + box.h / 2, box.y + dy + box.h].some((e2) => Math.abs(y - e2) < 0.5)) : [];
    return { dx, dy, gv: Array.from(new Set(gv)), gh: Array.from(new Set(gh)) };
  }
  function onPointerMove(e: RPointerEvent) {
    if (overlayRef.current) mouseAt.current = toWorld(e.clientX, e.clientY);
    const g = drag.current;
    if (!g) return;
    // Ctrl (⌘) flips whatever Snap to grid is set to
    const free = snap === (e.ctrlKey || e.metaKey);
    if (g.kind === "pan") { moveCam({ ...cam, x: g.cam!.x + (e.clientX - g.sx), y: g.cam!.y + (e.clientY - g.sy) }); return; }
    const { px, py } = toWorld(e.clientX, e.clientY);
    if (g.kind === "rotate") {
      g.moved = true;
      setDragging("rotate");
      let deg = g.rot0! + ((Math.atan2(py - g.cy!, px - g.cx!) - g.a0!) * 180) / Math.PI;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      // Shift: steps of 15°; otherwise it still clicks onto straight angles
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.abs(deg - Math.round(deg / 90) * 90) < 3 ? Math.round(deg / 90) * 90 : Math.round(deg);
      if (deg === -180) deg = 180;
      const id = Array.from(g.start.keys())[0];
      setDoc({ ...g.before, pieces: g.before.pieces.map((p) => (p.id !== id ? p : { ...p, style: { ...(p.style || {}), rotate: deg || undefined } })) }, { history: false });
      return;
    }
    if (g.kind === "draw") {
      g.moved = true;
      let x = Math.min(px, g.sx), y = Math.min(py, g.sy), w = Math.abs(px - g.sx), h = Math.abs(py - g.sy);
      // Shift: a perfect square (or circle)
      if (e.shiftKey) { const n = Math.max(w, h); w = n; h = n; x = px < g.sx ? g.sx - n : g.sx; y = py < g.sy ? g.sy - n : g.sy; }
      if (!free) { const x2 = Math.round((x + w) / colW) * colW, y2 = Math.round((y + h) / ROW) * ROW; x = Math.round(x / colW) * colW; y = Math.round(y / ROW) * ROW; w = x2 - x; h = y2 - y; }
      setDrawBox({ x, y, w, h });
      return;
    }
    if (g.kind === "marquee") {
      const r = { x: Math.min(px, g.sx), y: Math.min(py, g.sy), w: Math.abs(px - g.sx), h: Math.abs(py - g.sy) };
      setMarquee(r);
      if (r.w > 3 || r.h > 3) {
        const hit = pieces.filter((p) => !p.hidden && !p.parent && p.x * colW < r.x + r.w && (p.x + p.w) * colW > r.x && p.y * ROW < r.y + r.h && (p.y + p.h) * ROW > r.y).map((p) => p.id);
        setSel(g.additive ? Array.from(new Set([...sel, ...hit])) : hit);
      }
      return;
    }
    let dxPx = (e.clientX - g.sx) / cam.z, dyPx = (e.clientY - g.sy) / cam.z;
    if (!g.moved && Math.abs(dxPx) < 3 && Math.abs(dyPx) < 3) return;
    if (!g.moved && (g.kind === "move" || g.kind === "resize")) setDragging(g.kind);
    g.moved = true;
    // Shift while moving: only across or only up and down
    if (g.kind === "move" && e.shiftKey) { if (Math.abs(dxPx) > Math.abs(dyPx)) dyPx = 0; else dxPx = 0; }
    const base = g.before;
    if (g.kind === "child") {
      // a piece inside a frame: slide it to a new place in the frame, into another frame, or out onto the page
      const sb = g.startBox || { x: px, y: py, w: 80, h: 40 };
      setGhost({ x: sb.x + dxPx, y: sb.y + dyPx, w: sb.w, h: sb.h });
      setDropInto(frameAt(px, py, withKids(Array.from(g.start.keys()))));
      return;
    }
    if (g.kind === "move") {
      const group = Array.from(g.start.values());
      const minX = Math.min(...group.map((p) => p.x)), maxR = Math.max(...group.map((p) => p.x + p.w)), minY = Math.min(...group.map((p) => p.y));
      const box = { x: minX * colW + dxPx, y: minY * ROW + dyPx, w: (maxR - minX) * colW, h: (Math.max(...group.map((p) => p.y + p.h)) - minY) * ROW };
      let dc: number, dr: number;
      if (free) {
        const s = snapToGuides(box, withKids(Array.from(g.start.keys())));
        dc = (dxPx + s.dx) / colW; dr = (dyPx + s.dy) / ROW;
        setGuides({ v: s.gv, h: s.gh });
      } else {
        dc = Math.round(dxPx / colW); dr = Math.round(dyPx / ROW);
        setGuides({ v: [], h: [] });
      }
      dc = clamp(dc, -minX, COLS - maxR);
      dr = Math.max(dr, -minY);
      // one piece dragged over an auto layout frame drops inside it
      setDropInto(group.length === 1 && group[0].part !== "stack" ? frameAt(px, py, withKids([group[0].id])) : group.length === 1 ? frameAt(px, py, withKids([group[0].id])) : null);
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
      // Shift on a corner: keep its shape
      if (e.shiftKey && dir.length === 2 && p0.w > 0 && p0.h > 0) {
        const ratio = (p0.w * colW) / (p0.h * ROW);
        if ((w * colW) / ratio >= h * ROW) h = (w * colW) / ratio / ROW; else w = (h * ROW * ratio) / colW;
        x = dir.includes("w") ? p0.x + p0.w - w : p0.x;
        y = dir.includes("n") ? p0.y + p0.h - h : p0.y;
      }
      // Alt: grow from the middle
      if (e.altKey) {
        if (/[ew]/.test(dir)) { const gw = w - p0.w; w = p0.w + 2 * gw; x = p0.x - gw; }
        if (/[ns]/.test(dir)) { const gh = h - p0.h; h = p0.h + 2 * gh; y = p0.y - gh; }
      }
      if (free) {
        const s = snapToGuides({ x: x * colW, y: y * ROW, w: w * colW, h: h * ROW }, new Set([p0.id]));
        if (dir.includes("e")) w += s.dx / colW;
        if (dir.includes("w")) { x += s.dx / colW; w -= s.dx / colW; }
        if (dir.includes("s")) h += s.dy / ROW;
        if (dir.includes("n")) { y += s.dy / ROW; h -= s.dy / ROW; }
        setGuides({ v: s.gv, h: s.gh });
      } else {
        if (dir.includes("e")) w = Math.round(x + w) - x;
        if (dir.includes("w")) { const nx = Math.round(x); w += x - nx; x = nx; }
        if (dir.includes("s")) h = Math.round(y + h) - y;
        if (dir.includes("n")) { const ny = Math.round(y); h += y - ny; y = ny; }
        setGuides({ v: [], h: [] });
      }
      const minW = free ? 0.5 : 1, minH = free ? 0.5 : 1;
      if (w < minW) { if (dir.includes("w")) x -= minW - w; w = minW; }
      if (h < minH) { if (dir.includes("n")) y -= minH - h; h = minH; }
      if (x < 0) { w += x; x = 0; }
      if (x + w > COLS) w = COLS - x;
      if (y < 0) { h += y; y = 0; }
      const inFrame = !!p0.parent;
      const keepSizing = inFrame || p0.part === "stack";
      setDoc({
        ...base,
        pieces: base.pieces.map((p) => (p.id !== p0.id ? p : {
          ...p, w: round2(w), h: round2(h),
          ...(inFrame ? {} : { x: round2(x), y: round2(y) }),
          // dragging a size by hand makes it a fixed size (in the direction you dragged)
          ...(/[ew]/.test(dir) ? { sizeW: keepSizing ? "fixed" as Sizing : undefined } : {}),
          ...(/[ns]/.test(dir) ? { sizeH: keepSizing ? "fixed" as Sizing : undefined } : {}),
        })),
      }, { history: false });
    }
  }
  function onPointerUp(e?: RPointerEvent) {
    const g = drag.current;
    drag.current = null;
    setDragging("");
    if (g?.undoTo && !g.moved) {
      // Alt-click without dragging: no copies after all
      setDoc(g.undoTo, { history: false });
      setSel(g.dupOf || []);
      return;
    }
    setGuides({ v: [], h: [] });
    setMarquee(null);
    const target = dropInto;
    setDropInto(null);
    setGhost(null);
    if (!g) return;
    if (g.kind === "draw") {
      const b = drawBox;
      setDrawBox(null);
      const partId = ({ frame: "stack", rect: "box", ellipse: "circle", line: "line", text: "heading" } as Record<string, string>)[tool] || "box";
      if (b && b.w > 4 && b.h > 4) addPart(partId, { x: b.x / colW, y: b.y / ROW }, { w: round2(Math.max(0.5, b.w / colW)), h: round2(Math.max(0.5, b.h / ROW)) });
      else if (b) { const part = PART_BY_ID.get(partId)!; addPart(partId, { x: b.x / colW + part.w / 2, y: b.y / ROW + part.h / 2 }); }
      setTool("move");
      return;
    }
    if (g.kind === "child" && g.moved) {
      const id = Array.from(g.start.keys())[0];
      const p = g.start.get(id)!;
      const pt = e ? toWorld(e.clientX, e.clientY) : null;
      const sb = g.startBox || { x: 0, y: 0, w: p.w * colW, h: p.h * ROW };
      if (target) change((d) => insertInto(d, p, target.stack, target.index));
      else change((d) => {
        // out onto the page, where you let go
        const w = round2(sb.w / colW), h = round2(sb.h / ROW);
        const left = (pt ? pt.px : sb.x) - (g.sx - g.sx) - sb.w / 2, top = (pt ? pt.py : sb.y) - sb.h / 2;
        return { ...d, pieces: [...d.pieces.filter((x) => x.id !== id), { ...p, parent: undefined, sizeW: undefined, sizeH: undefined, w, h, z: maxZ() + 1, x: round2(clamp(left / colW, 0, COLS - w)), y: round2(Math.max(0, top / ROW)) }] };
      });
      return;
    }
    if (g.kind === "move" && g.moved && target && g.start.size === 1) {
      const id = Array.from(g.start.keys())[0];
      change((d) => insertInto(d, d.pieces.find((x) => x.id === id)!, target.stack, target.index), false);
      setPast((p) => [...p.slice(-99), g.undoTo || g.before]); setFuture([]);
      return;
    }
    if (g.kind === "marquee" || g.kind === "pan" || !g.moved) return;
    // one undo step for the whole drag
    setPast((p) => [...p.slice(-99), g.undoTo || g.before]);
    setFuture([]);
    setDirty(true);
  }

  /* ---------- keyboard ---------- */
  function zoomToSelection() {
    const el = stageRef.current;
    const bs = selected.map((p) => rectOf(p)).filter(Boolean) as Box[];
    if (!el || !bs.length) { fit(); return; }
    const x1 = Math.min(...bs.map((b) => b.x)), y1 = Math.min(...bs.map((b) => b.y));
    const x2 = Math.max(...bs.map((b) => b.x + b.w)), y2 = Math.max(...bs.map((b) => b.y + b.h));
    const z = clamp(Math.min((el.clientWidth - 160) / (x2 - x1), (el.clientHeight - 200) / (y2 - y1)), 0.08, 4);
    moveCam({ z, x: el.clientWidth / 2 - ((x1 + x2) / 2) * z, y: el.clientHeight / 2 - ((y1 + y2) / 2) * z - 30 }, true);
  }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setKeys((k) => ({ ...k, ctrl: true }));
      if (e.key === "Alt") setKeys((k) => ({ ...k, alt: true }));
      if (isTyping(e.target)) return;
      if (palette) return;
      // Esc while dragging puts everything back
      if (e.key === "Escape" && drag.current && drag.current.moved && ["move", "resize", "rotate", "child"].includes(drag.current.kind)) {
        const g = drag.current;
        drag.current = null;
        setDoc(g.undoTo || g.before, { history: false });
        if (g.dupOf) setSel(g.dupOf);
        setDragging(""); setGuides({ v: [], h: [] }); setDropInto(null); setGhost(null);
        return;
      }
      if (e.key === " " && !e.repeat) { e.preventDefault(); setKeys((k) => ({ ...k, space: true })); return; }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === "k" || k === "/")) { e.preventDefault(); setPalette(true); return; }
      if (mod && e.altKey && e.code === "KeyC") { e.preventDefault(); copyStyle(); return; }
      if (mod && e.altKey && e.code === "KeyV") { e.preventDefault(); pasteStyle(); return; }
      if (mod && e.altKey && e.code === "KeyT") { e.preventDefault(); tidyUp(); return; }
      if (mod && e.shiftKey && k === "v") { e.preventDefault(); paste("inplace"); return; }
      if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "y") { e.preventDefault(); redo(); return; }
      if (mod && k === "s") { e.preventDefault(); setDirty(false); save().then((id) => id && say("Saved ✓")); return; }
      if (mod && (k === "=" || k === "+")) { e.preventDefault(); zoomAt(1.25, undefined, undefined, true); return; }
      if (mod && k === "-") { e.preventDefault(); zoomAt(0.8, undefined, undefined, true); return; }
      if (e.shiftKey && e.code === "Digit1") { e.preventDefault(); fit(); return; }
      if (e.shiftKey && e.code === "Digit0") { e.preventDefault(); zoomAt(1 / camRef.current.z, undefined, undefined, true); return; }
      if (e.shiftKey && e.code === "Digit2") { e.preventDefault(); zoomToSelection(); return; }
      if (!docRef.current) return;
      if (mod && k === "a") { e.preventDefault(); setSel(docRef.current.pieces.filter((p) => !p.hidden && !p.parent).map((p) => p.id)); return; }
      if (mod && k === "d") { e.preventDefault(); duplicateSel(); return; }
      if (mod && k === "c") { clipboard.current = selected.map((p) => ({ ...p })); if (selected.length) say(`Copied ${selected.length}`); return; }
      if (mod && k === "x") { clipboard.current = selected.map((p) => ({ ...p })); removeSel(); return; }
      if (mod && k === "v") { e.preventDefault(); paste("mouse"); return; }
      if (e.shiftKey && e.altKey && e.code === "KeyA") { e.preventDefault(); const st = selected.find((p) => p.part === "stack"); if (st) removeAutoLayout(st.id); return; }
      if (e.shiftKey && !mod && k === "a") { e.preventDefault(); addAutoLayout(); return; }
      if (e.shiftKey && k === "i") { e.preventDefault(); setLeftTab("assets"); return; }
      if (k === "delete" || k === "backspace") { if (selected.length) { e.preventDefault(); removeSel(); } return; }
      if (k === "escape") {
        setCtxMenu(null); setMenu(""); setShapeMenu(false); setTool("move");
        // Esc picks the frame around what's picked, then nothing
        setSel(one?.parent ? [one.parent] : []);
        if (modal && (modal !== "start" || docRef.current)) setModal("");
        return;
      }
      if (k === "tab" && !mod && !e.altKey) { e.preventDefault(); cycle(e.shiftKey); return; }
      if (e.shiftKey && !mod && e.code === "KeyR" && selected.length) { e.preventDefault(); rotateSel(e.altKey ? -90 : 90); return; }
      if (k === "enter" && one?.part === "stack") { const kids = childrenOf(one.id); if (kids.length) setSel(kids.map((c) => c.id)); return; }
      if (k === "]") { layer(mod ? "front" : "up"); return; }
      if (k === "[") { layer(mod ? "back" : "down"); return; }
      if (mod && e.shiftKey && k === "l") { e.preventDefault(); updatePieces(sel, (p) => ({ ...p, locked: !p.locked || undefined })); return; }
      if (mod && e.shiftKey && k === "h") { e.preventDefault(); updatePieces(sel, (p) => ({ ...p, hidden: !p.hidden || undefined })); return; }
      if (mod) return;
      const toolKeys: Record<string, Tool> = { v: "move", h: "hand", f: "frame", r: "rect", o: "ellipse", l: "line", t: "text" };
      if (toolKeys[k] && !e.shiftKey && !e.altKey) { setTool(toolKeys[k]); setMode("edit"); return; }
      if (k === "g" && e.shiftKey) { setSnap(!snap); say(snap ? "Moving freely" : "Snapping to the grid"); return; }
      if (k === "g") { setShowGrid((s) => !s); return; }
      if (k === "p") { setMode((m) => (m === "edit" ? "try" : "edit")); setSel([]); return; }
      if (k === "?") { setModal("help"); return; }
      if (k.startsWith("arrow") && selected.length) {
        e.preventDefault();
        // free: 1px (Shift = 10px), like Figma; snapping: a column (Shift = 4, Alt = a quarter)
        const px = e.shiftKey ? 10 : 1;
        const sx = snap ? (e.altKey ? 0.25 : e.shiftKey ? 4 : 1) : px / colW, sy = snap ? sx : px / ROW;
        const dx = k === "arrowleft" ? -sx : k === "arrowright" ? sx : 0;
        const dy = k === "arrowup" ? -sy : k === "arrowdown" ? sy : 0;
        updatePieces(selected.filter((p) => !p.locked && !p.parent).map((p) => p.id), (p) => ({ ...p, x: round2(clamp(p.x + dx, 0, COLS - p.w)), y: round2(Math.max(0, p.y + dy)) }));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") setKeys((k) => ({ ...k, ctrl: false }));
      if (e.key === "Alt") setKeys((k) => ({ ...k, alt: false }));
      if (e.key === " ") setKeys((k) => ({ ...k, space: false }));
    };
    const blur = () => setKeys({ ctrl: false, space: false, alt: false });
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  });

  /* ---------- the AI ---------- */
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chat, aiBusy]);
  async function askAI(text: string) {
    const d = docRef.current;
    const msg = text.trim();
    if (!d || !msg || aiBusy) return;
    setAiText("");
    setChat((c) => [...c, { role: "user", text: msg }]);
    setAiBusy(true);
    try {
      const r = await api<{ reply: string; action: string; design?: Pick<BuiltDesign, "canvas" | "pieces">; usage: Usage }>("/api/designs/ai", {
        message: msg, design: { canvas: d.canvas, pieces: d.pieces }, selection: sel,
        history: chat.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, text: m.text })),
      });
      setUsage(r.usage);
      let before: Draft | undefined;
      if (r.design && docRef.current) {
        before = docRef.current;
        setDoc({ ...docRef.current, canvas: r.design.canvas, pieces: r.design.pieces });
        setSel((s) => s.filter((id) => r.design!.pieces.some((p) => p.id === id)));
        if (r.action === "replace") window.setTimeout(() => fit(), 50);
      }
      setChat((c) => [...c, { role: "assistant", text: r.reply, before }]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", text: e instanceof Error ? e.message : "The AI couldn't answer — try again", error: true }]);
      api<Usage>("/api/designs/ai").then(setUsage).catch(() => {});
    } finally {
      setAiBusy(false);
    }
  }

  /* ---------- design-level actions ---------- */
  async function applyDesign() {
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
    const name = key === "blank" ? "Untitled" : `${TEMPLATE_LIST.find((x) => x[0] === key)?.[1] || ""} remix`;
    openDoc({ name, emoji: "🎨", ...t });
    history.replaceState(null, "", "/builder");
  }
  async function deleteDoc() {
    const d = docRef.current;
    if (!d || !confirm(`Delete “${d.name}”? This can't be undone.`)) return;
    if (d.id) await galleryAction("delete", d.id, "Deleted");
    docRef.current = null;
    setDocState(null);
    setModal("start");
    history.replaceState(null, "", "/builder");
  }
  const switchTo = async (id: string) => {
    await api("/api/designs", { action: "use", id }).catch(() => {});
    refreshLists();
    if (window.opener && !window.opener.closed) { window.opener.postMessage({ type: "use-design", id }, location.origin); say("✅ It's on — look at your other tab"); } else window.open(`/?design=${id}`, "_blank");
  };

  /* ====================================================================== */
  if (!me) return <div className="fg-app fg-center"><div className="fg-spinner" /></div>;
  if (!me.user) {
    return (
      <div className="fg-app fg-center">
        <div className="fg-card">
          <h1>🎨 Design builder</h1>
          <p>Build your own home page out of pieces of every design — drag, drop, resize and colour everything, like Figma.</p>
          <p><strong>Log in first</strong> so your designs are saved to your account.</p>
          <a className="fg-btn primary" href="/">Log in on the home page</a>
        </div>
      </div>
    );
  }

  const staff = !!lists?.staff;
  const isAdmin = me.role === "owner" || me.role === "admin";
  const canvas = doc?.canvas || DEFAULT_CANVAS;
  const setCanvas = (patch: Partial<DesignCanvas>) => change((d) => ({ ...d, canvas: { ...d.canvas, ...patch } }));
  const editing = mode === "edit" && device !== "phone";
  const px = (cols: number) => Math.round(cols * colW);
  const statusText = status === "saving" ? "Saving…" : status === "error" ? "Not saved" : dirty ? "Edited" : doc?.id ? "Saved" : "Not saved yet";

  /* ---------- left: file (pages + layers) and assets ---------- */
  const matching = q.trim() ? PARTS.filter((p) => `${p.name} ${p.blurb} ${p.folder}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const assetTile = (p: PartDef) => (
    <button key={p.id} className={`fg-asset ${p.design ? "comp" : ""}`} draggable title={p.blurb}
      onDragStart={(e) => { e.dataTransfer.setData("application/x-part", p.id); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={() => addPart(p.id)}>
      <span className="fg-asset-thumb">{p.emoji}</span>
      <span className="fg-asset-name">{p.name}</span>
    </button>
  );
  const assetGroup = (name: string, path: string, list: PartDef[], depth = 0, sub?: ReactNode): ReactNode => {
    const open = openFolders.has(path);
    return (
      <div key={path} className={`fg-agroup depth-${depth}`}>
        <button className="fg-agroup-head" onClick={() => setOpenFolders((s0) => { const n = new Set(s0); if (n.has(path)) n.delete(path); else n.add(path); return n; })}>
          <i>{open ? "▾" : "▸"}</i><span>{name}</span><em>{sub ? "" : list.length}</em>
        </button>
        {open && (sub || <div className="fg-agrid">{list.map(assetTile)}</div>)}
      </div>
    );
  };
  const assets = matching ? (
    <div className="fg-agrid">{matching.length ? matching.map(assetTile) : <p className="fg-muted">Nothing called that.</p>}</div>
  ) : (
    <>
      {PART_FOLDERS.map((f) => f === "Design pieces"
        ? assetGroup("Design pieces", f, [], 0, <div className="fg-agroup-sub">{BUILT_IN_DESIGNS.map(([, label]) => assetGroup(label, `Design pieces/${label}`, PARTS.filter((p) => p.folder === `Design pieces/${label}`), 1))}</div>)
        : assetGroup(f, f, PARTS.filter((p) => p.folder === f)))}
    </>
  );
  const layerRow = (p: DesignPiece, depth: number, flat = false): ReactNode => {
    const part = PART_BY_ID.get(p.part);
    const kids = flat ? [] : pieces.filter((c) => c.parent === p.id);
    const folded = collapsedLayers.has(p.id);
    return (
      <div key={p.id}>
        <div className={`fg-layer ${sel.includes(p.id) ? "on" : ""} ${p.hidden ? "hidden" : ""} ${part?.design ? "comp" : ""} ${p.part === "stack" ? "frame" : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }} draggable
          onMouseEnter={() => setHoverId(p.id)} onMouseLeave={() => setHoverId(null)}
          onDragStart={() => { layerDrag.current = p.id; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.stopPropagation();
            const from = layerDrag.current;
            if (!from || from === p.id || withKids([from]).has(p.id)) return;
            change((d) => {
              const moving = d.pieces.find((x) => x.id === from)!;
              if (p.part === "stack") return insertInto(d, moving, p.id, d.pieces.filter((x) => x.parent === p.id).length);
              const rest = d.pieces.filter((x) => x.id !== from);
              if (p.parent) { rest.splice(rest.findIndex((x) => x.id === p.id), 0, { ...moving, parent: p.parent }); return { ...d, pieces: rest }; }
              // among the top pieces: just above this one
              const order = rest.filter((x) => !x.parent).sort((a, b) => a.z - b.z).map((x) => x.id);
              order.splice(order.indexOf(p.id) + 1, 0, from);
              const z = new Map(order.map((id, i) => [id, i + 1]));
              const r = rects[from];
              const moved = moving.parent ? { ...moving, parent: undefined, sizeW: undefined, sizeH: undefined, ...(r ? { x: round2(clamp(r.x / colW, 0, COLS - moving.w)), y: round2(r.y / ROW) } : {}) } : moving;
              return { ...d, pieces: [...rest, moved].map((x) => ({ ...x, z: z.get(x.id) || x.z })) };
            });
          }}
          onClick={(e) => setSel(e.shiftKey ? (sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id]) : [p.id])}
          onDoubleClick={() => setRenaming(p.id)}>
          {kids.length ? <button className="fg-caret" onClick={(e) => { e.stopPropagation(); setCollapsedLayers((s0) => { const n = new Set(s0); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); }}>{folded ? "▸" : "▾"}</button> : <span className="fg-caret" />}
          <span className="fg-layer-icon">{layerIcon(p, part)}</span>
          {renaming === p.id ? (
            <input className="fg-layer-rename" autoFocus defaultValue={p.name || part?.name} onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { updatePieces([p.id], (x) => ({ ...x, name: e.target.value.trim() || undefined })); setRenaming(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
          ) : <span className="fg-layer-name">{p.name || part?.name}</span>}
          <span className="fg-layer-tools">
            <button title={p.locked ? "Unlock" : "Lock"} className={p.locked ? "keep" : ""} onClick={(e) => { e.stopPropagation(); updatePieces([p.id], (x) => ({ ...x, locked: !x.locked || undefined })); }}>{p.locked ? "🔒" : "🔓"}</button>
            <button title={p.hidden ? "Show" : "Hide"} className={p.hidden ? "keep" : ""} onClick={(e) => { e.stopPropagation(); updatePieces([p.id], (x) => ({ ...x, hidden: !x.hidden || undefined })); }}>{p.hidden ? "◌" : "👁"}</button>
          </span>
        </div>
        {!folded && kids.map((c) => layerRow(c, depth + 1))}
      </div>
    );
  };
  const topLayers = [...pieces].filter((p) => !p.parent || !byId.has(p.parent)).sort((a, b) => b.z - a.z);

  /* ---------- right: Design ---------- */
  const st1 = one?.style || {};
  const ids = sel;
  const part1 = one ? PART_BY_ID.get(one.part) : undefined;
  const inFrame = !!one?.parent;
  const r1 = one ? rectOf(one) : null;
  const propField = (p: DesignPiece, def: PropDef) => {
    const v = p.props?.[def.key] ?? def.def;
    if (def.when) {
      const [k, vals] = def.when;
      if (!vals.includes(p.props?.[k] ?? (PART_BY_ID.get(p.part)?.props?.find((x) => x.key === k)?.def as PropValue))) return null;
    }
    let field: ReactNode;
    switch (def.type) {
      case "bool": field = <Toggle on={!!v} onChange={(x) => setProp(p.id, def.key, x)} />; break;
      case "number": field = <Field value={Number(v)} min={def.min} max={def.max} onChange={(x) => setProp(p.id, def.key, x)} />; break;
      case "select": case "action":
        field = <select className="fg-select" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)}>{(def.options || []).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
        break;
      case "folder":
        field = (
          <select className="fg-select" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)}>
            <option value="">Pick a folder…</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
          </select>
        );
        break;
      case "color": field = <ColorRow value={String(v)} onChange={(x) => setProp(p.id, def.key, x)} />; break;
      case "longtext": field = <textarea className="fg-input" rows={4} value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      case "date": field = <input className="fg-input" type="date" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      case "time": field = <input className="fg-input" type="time" value={String(v)} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      case "emoji": field = <input className="fg-input fg-emoji-in" value={String(v)} maxLength={16} onChange={(e) => setProp(p.id, def.key, e.target.value)} />; break;
      default: field = <input className="fg-input" value={String(v)} placeholder={def.type === "url" ? "https://…" : ""} onChange={(e) => setProp(p.id, def.key, e.target.value)} />;
    }
    return <Row key={def.key} label={def.label}>{field}</Row>;
  };
  const alignBar = (
    <div className="fg-alignbar">
      {([["left", "⇤", "Align left"], ["center", "⇹", "Align centres"], ["right", "⇥", "Align right"], ["top", "⤒", "Align top"], ["middle", "⇳", "Align middles"], ["bottom", "⤓", "Align bottom"]] as const).map(([k, icon, t]) => (
        <button key={k} title={t} disabled={!selected.length || (selected.length === 1 && ["top", "middle", "bottom"].includes(k))} onClick={() => align(k)}>{icon}</button>
      ))}
      <button title="Space evenly across" disabled={selected.length < 3} onClick={() => align("hdist")}>⋯</button>
      <button title="Space evenly down" disabled={selected.length < 3} onClick={() => align("vdist")}>⋮</button>
      <button title="Tidy up into a neat grid  Ctrl Alt T" disabled={selected.length < 2} onClick={tidyUp}>▦</button>
    </div>
  );
  const sizing = (axis: "W" | "H") => {
    const key = axis === "W" ? "sizeW" : "sizeH";
    const val = (one?.[key] as Sizing) || "fixed";
    return (
      <select className="fg-select fg-sizing" value={val} title={`${axis === "W" ? "Width" : "Height"} resizing`}
        onChange={(e) => updatePieces([one!.id], (p) => ({ ...p, [key]: e.target.value === "fixed" && !p.parent && p.part !== "stack" ? undefined : e.target.value as Sizing }))}>
        <option value="fixed">Fixed</option>
        {inFrame && <option value="fill">Fill container</option>}
        <option value="hug">Hug contents</option>
      </select>
    );
  };
  const stackSection = one?.part === "stack" ? (() => {
    const pr = one.props || {};
    const row = pr.dir !== "column";
    const A = String(pr.align || "start"), J = String(pr.justify || "start");
    const cells = ["start", "center", "end"];
    return (
      <Panel title="Auto layout" action={<button className="fg-icon-btn" title="Remove auto layout (Alt Shift A)" onClick={() => removeAutoLayout(one.id)}>−</button>}>
        <div className="fg-al">
          <div className="fg-al-left">
            <Seg value={row ? "row" : "column"} onChange={(v) => setProp(one.id, "dir", v)} options={[["row", "→", "Across"], ["column", "↓", "Down"]]} />
            <button className={`fg-chip ${pr.wrap ? "on" : ""}`} title="Wrap onto new lines" onClick={() => setProp(one.id, "wrap", !pr.wrap)}>↩ Wrap</button>
          </div>
          <div className="fg-al-grid" title="Line up the pieces inside">
            {cells.map((v) => cells.map((h) => {
              const main = row ? h : v, cross = row ? v : h;
              const on = (J === main || (J === "between" && main === "center")) && (A === cross || (A === "stretch" && cross === "start"));
              return <button key={`${v}${h}`} className={on ? "on" : ""} onClick={() => updatePieces([one.id], (p) => ({ ...p, props: { ...p.props, justify: J === "between" ? "between" : main, align: cross } }))}><i /></button>;
            }))}
          </div>
        </div>
        <div className="fg-grid2">
          <Field icon={row ? "⇿" : "⇳"} title="Gap between pieces" value={Number(pr.gap ?? 12)} min={0} max={120} onChange={(v) => setProp(one.id, "gap", v)} />
          <Field icon="▣" title="Padding" value={Number(pr.pad ?? 12)} min={0} max={120} onChange={(v) => setProp(one.id, "pad", v)} />
        </div>
        <div className="fg-grid2">
          <Toggle label="Space between" on={J === "between"} onChange={(v) => setProp(one.id, "justify", v ? "between" : "start")} />
          <Toggle label="Stretch" on={A === "stretch"} onChange={(v) => setProp(one.id, "align", v ? "stretch" : "start")} />
        </div>
        <p className="fg-muted small">{childrenOf(one.id).length} inside · drag pieces in or out · Enter picks them</p>
      </Panel>
    );
  })() : null;
  const contentProps = (part1?.props || []).filter((d) => !ACTION_KEYS.includes(d.key) && !VIEWER_KEYS.includes(d.key) && part1?.id !== "stack");

  const designTab = !doc ? <p className="fg-muted pad">Start a design to see its settings.</p> : selected.length === 0 ? (
    <>
      <Panel title="Page">
        <Row label="Name"><input className="fg-input" value={doc.name} maxLength={40} onChange={(e) => change((d) => ({ ...d, name: e.target.value }), false)} /></Row>
        <Row label="Icon"><input className="fg-input fg-emoji-in" value={doc.emoji} maxLength={8} onChange={(e) => change((d) => ({ ...d, emoji: e.target.value }), false)} /></Row>
        <Row label="About"><textarea className="fg-input" rows={2} maxLength={160} value={doc.description || ""} placeholder="Shown in the gallery" onChange={(e) => change((d) => ({ ...d, description: e.target.value }), false)} /></Row>
      </Panel>
      <Panel title="Fill">
        <ColorRow value={canvas.bg} onChange={(v) => setCanvas({ bg: v })} />
        <Row label="Pattern">
          <select className="fg-select" value={canvas.bgPattern || "none"} onChange={(e) => setCanvas({ bgPattern: e.target.value as DesignCanvas["bgPattern"] })}>
            {[["none", "None"], ["dots", "Dots"], ["grid", "Grid"], ["gradient", "Soft gradient"], ["aurora", "Aurora glow"], ["stripes", "Stripes"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Row>
        <Row label="Picture"><input className="fg-input" value={canvas.bgImage || ""} placeholder="https://… (optional)" onChange={(e) => setCanvas({ bgImage: e.target.value })} /></Row>
      </Panel>
      <Panel title="Colours">
        <Row label="Text"><ColorRow value={canvas.text} onChange={(v) => setCanvas({ text: v })} /></Row>
        <Row label="Accent"><ColorRow value={canvas.accent} onChange={(v) => setCanvas({ accent: v })} /></Row>
        <Row label="Menus"><Seg value={canvas.tone} onChange={(v) => setCanvas({ tone: v })} options={[["dark", "🌙 Dark"], ["light", "☀️ Light"]]} /></Row>
        <Toggle label="Blend every piece into this page" on={canvas.blend !== false} onChange={(v) => setCanvas({ blend: v })} />
        <p className="fg-muted small">Pieces from Orbit, Journal, Terminal… wear these colours and this font, so it all looks like one design.</p>
      </Panel>
      <Panel title="Text">
        <select className="fg-select" value={canvas.font} onChange={(e) => setCanvas({ font: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
      </Panel>
      <Panel title="Size">
        <Field icon="H" title="Page height in rows" value={canvas.rows} min={20} max={600} suffix="rows" onChange={(v) => setCanvas({ rows: v })} />
      </Panel>
      <Panel title="Start again" open={false}>
        <div className="fg-tplmini">
          {TEMPLATE_LIST.map(([k, l, e]) => <button key={k} className="fg-btn sm" onClick={() => { change((d) => ({ ...d, ...templateDesign(k) })); setSel([]); }}>{e} {l}</button>)}
        </div>
      </Panel>
      {isAdmin && doc.id && (
        <Panel title="Admin" open={false}>
          <p className="fg-muted small">{lists?.siteDefault === doc.id ? "⭐ New visitors start with this design." : "Make new visitors start with this design."}</p>
          <button className="fg-btn sm" onClick={() => setSiteDefault(lists?.siteDefault === doc.id ? "" : doc.id!)}>{lists?.siteDefault === doc.id ? "Stop using it as the default" : "⭐ Make it the site default"}</button>
        </Panel>
      )}
    </>
  ) : one ? (
    <>
      <div className="fg-selhead">
        <span className={`fg-selicon ${part1?.design ? "comp" : ""}`}>{layerIcon(one, part1)}</span>
        <input className="fg-input fg-selname" value={one.name ?? ""} placeholder={part1?.name} maxLength={40} onChange={(e) => updatePieces([one.id], (p) => ({ ...p, name: e.target.value || undefined }), false)} />
      </div>
      <p className="fg-muted small pad">{part1?.design ? `◈ From ${part1.design[0].toUpperCase()}${part1.design.slice(1)} · ` : ""}{part1?.blurb}</p>
      {alignBar}
      <Panel title="Position">
        {inFrame ? <p className="fg-muted small">In an auto layout frame — the frame places it. Drag it out to place it yourself.</p> : (
          <div className="fg-grid2">
            <Field icon="X" value={px(one.x)} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, x: round2(clamp(v / colW, 0, COLS - p.w)) }))} />
            <Field icon="Y" value={Math.round(one.y * ROW)} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, y: round2(Math.max(0, v / ROW)) }))} />
          </div>
        )}
        <div className="fg-grid2 fg-rotrow">
          <Field icon="↻" title="Rotation (drag the round handle above a piece; Shift for 15° steps)" value={st1.rotate || 0} min={-180} max={180} suffix="°" onChange={(v) => rotateSel(v - (st1.rotate || 0))} />
          <div className="fg-rotbtns">
            <button className="fg-icon-btn" title="Turn left 90°  Alt Shift R" onClick={() => rotateSel(-90)}>⟲</button>
            <button className="fg-icon-btn" title="Turn right 90°  Shift R" onClick={() => rotateSel(90)}>⟳</button>
            {!!st1.rotate && <button className="fg-icon-btn" title="Straighten" onClick={() => rotateSel(null)}>0°</button>}
          </div>
        </div>
      </Panel>
      <Panel title="Layout" action={one.part !== "stack" ? <button className="fg-icon-btn" title="Add auto layout (Shift A)" onClick={addAutoLayout}>+</button> : undefined}>
        <div className="fg-grid2">
          <Field icon="W" value={Math.round(r1?.w ?? px(one.w))} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, w: round2(clamp(v / colW, 0.25, COLS - (p.parent ? 0 : p.x))), sizeW: p.parent || p.part === "stack" ? "fixed" : undefined }))} />
          <Field icon="H" value={Math.round(r1?.h ?? one.h * ROW)} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, h: round2(Math.max(0.5, v / ROW)), sizeH: p.parent || p.part === "stack" ? "fixed" : undefined }))} />
        </div>
        {(inFrame || one.part === "stack") && <div className="fg-grid2 fg-sizings"><label>W {sizing("W")}</label><label>H {sizing("H")}</label></div>}
        {!inFrame && <button className="fg-link" onClick={() => updatePieces([one.id], (p) => ({ ...p, x: 0, w: COLS }))}>⟷ Full width</button>}
      </Panel>
      {stackSection}
      <Panel title="Appearance">
        <div className="fg-grid2">
          <Field icon="◐" title="Opacity" value={Math.round((st1.opacity ?? 1) * 100)} min={5} max={100} suffix="%" onChange={(v) => setStyle(ids, { opacity: v >= 100 ? undefined : v / 100 })} />
          <Field icon="◜" title="Corner radius" value={Math.min(st1.radius ?? 0, 999)} min={0} max={999} onChange={(v) => setStyle(ids, { radius: v })} />
        </div>
        {part1?.design && <Toggle label="Keep its own design's colours" on={!!st1.keep} onChange={(v) => setStyle(ids, { keep: v || undefined })} />}
      </Panel>
      <Panel title="Fill" action={st1.bg ? undefined : <button className="fg-icon-btn" title="Add a fill" onClick={() => setStyle(ids, { bg: "#1c2030" })}>+</button>}>
        {st1.bg ? <ColorRow value={st1.bg} onChange={(v) => setStyle(ids, { bg: v })} onRemove={() => setStyle(ids, { bg: undefined })} /> : <p className="fg-muted small">{part1?.design ? "Uses the design's own background" : "No fill"}</p>}
      </Panel>
      <Panel title="Stroke" action={st1.borderWidth ? undefined : <button className="fg-icon-btn" title="Add a stroke" onClick={() => setStyle(ids, { borderWidth: 1, borderColor: "#ffffff33" })}>+</button>}>
        {!!st1.borderWidth && (
          <>
            <ColorRow value={st1.borderColor} onChange={(v) => setStyle(ids, { borderColor: v })} onRemove={() => setStyle(ids, { borderWidth: undefined, borderColor: undefined })} />
            <Field icon="≡" title="Stroke width" value={st1.borderWidth} min={1} max={12} onChange={(v) => setStyle(ids, { borderWidth: v })} />
          </>
        )}
      </Panel>
      <Panel title="Effects" action={<button className="fg-icon-btn" title="Add an effect" onClick={() => setStyle(ids, st1.shadow ? { glass: true } : { shadow: "soft" })}>+</button>}>
        {st1.shadow && (
          <div className="fg-effect">
            <select className="fg-select" value={st1.shadow} onChange={(e) => setStyle(ids, { shadow: e.target.value as PieceStyle["shadow"] })}>
              <option value="soft">Drop shadow</option><option value="strong">Big shadow</option><option value="glow">Glow</option>
            </select>
            <button className="fg-icon-btn" title="Remove" onClick={() => setStyle(ids, { shadow: undefined })}>−</button>
          </div>
        )}
        {st1.glass && (
          <div className="fg-effect">
            <span className="fg-effect-name">Background blur (glass)</span>
            <button className="fg-icon-btn" title="Remove" onClick={() => setStyle(ids, { glass: undefined })}>−</button>
          </div>
        )}
        <Field icon="▣" title="Padding inside" value={st1.pad ?? 0} min={0} max={80} onChange={(v) => setStyle(ids, { pad: v || undefined })} />
      </Panel>
      <Panel title="Text">
        <select className="fg-select" value={st1.font || ""} onChange={(e) => setStyle(ids, { font: e.target.value || undefined })}><option value="">Page font</option>{FONT_CHOICES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
        <Field icon="Aa" title="Text size" value={st1.size ?? 100} min={50} max={250} step={5} suffix="%" onChange={(v) => setStyle(ids, { size: v === 100 ? undefined : v })} />
        <Row label="Colour"><ColorRow value={st1.text} placeholder="page's" onChange={(v) => setStyle(ids, { text: v })} onRemove={st1.text ? () => setStyle(ids, { text: undefined }) : undefined} /></Row>
        <Row label="Accent"><ColorRow value={st1.accent} placeholder="page's" onChange={(v) => setStyle(ids, { accent: v })} onRemove={st1.accent ? () => setStyle(ids, { accent: undefined }) : undefined} /></Row>
      </Panel>
      {contentProps.length > 0 && <Panel title="Content">{contentProps.map((d) => propField(one, d))}</Panel>}
      <Panel title="Layer">
        <div className="fg-grid2">
          <Toggle label="Lock" on={!!one.locked} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, locked: v || undefined }))} />
          <Toggle label="Hide" on={!!one.hidden} onChange={(v) => updatePieces([one.id], (p) => ({ ...p, hidden: v || undefined }))} />
        </div>
        <Row label="On phones">
          <Seg value={st1.phone || (part1?.deco ? "hide" : "show")} onChange={(v) => setStyle(ids, { phone: v })} options={[["show", "Show"], ["hide", "Hide"]]} />
        </Row>
        {!inFrame && (
          <div className="fg-seg wide">
            <button title="Send to back (Ctrl [)" onClick={() => layer("back")}>⤓</button><button title="Backward ([)" onClick={() => layer("down")}>↓</button>
            <button title="Forward (])" onClick={() => layer("up")}>↑</button><button title="Bring to front (Ctrl ])" onClick={() => layer("front")}>⤒</button>
          </div>
        )}
      </Panel>
    </>
  ) : (
    <>
      <div className="fg-selhead"><span className="fg-selicon">⧉</span><strong>{selected.length} layers</strong></div>
      {alignBar}
      <Panel title="Auto layout" action={<button className="fg-icon-btn" title="Add auto layout (Shift A)" onClick={addAutoLayout}>+</button>}>
        <p className="fg-muted small">Press + (or Shift A) to line these up in a frame.</p>
      </Panel>
      <Panel title="Appearance">
        <Field icon="◜" title="Corner radius" value={0} mixed min={0} max={999} onChange={(v) => setStyle(ids, { radius: v })} />
      </Panel>
      <Panel title="Fill" action={<button className="fg-icon-btn" title="Add a fill" onClick={() => setStyle(ids, { bg: "#1c2030" })}>+</button>}>
        <ColorRow value={undefined} placeholder="Mixed" onChange={(v) => setStyle(ids, { bg: v })} />
      </Panel>
      <Panel title="Effects">
        <Seg value={"" as string} onChange={(v) => setStyle(ids, { shadow: v === "none" ? undefined : v as PieceStyle["shadow"] })} options={[["none", "None"], ["soft", "Shadow"], ["glow", "Glow"]]} />
      </Panel>
    </>
  );

  /* ---------- right: Prototype (what things do) ---------- */
  const actionProps = (part1?.props || []).filter((d) => ACTION_KEYS.includes(d.key));
  const viewerProps = (part1?.props || []).filter((d) => VIEWER_KEYS.includes(d.key));
  const protoTab = !one ? (
    <div className="fg-empty">
      <div className="fg-empty-icon">◎</div>
      <p>Pick a button to choose what happens when it&apos;s clicked, or a folder window to choose how it opens.</p>
      <p className="fg-muted small">Ready-made buttons are in Assets → Functions &amp; buttons.</p>
    </div>
  ) : actionProps.length ? (
    <Panel title="Interactions">
      <div className="fg-interaction">
        <span className="fg-trigger">On click</span>
        <span className="fg-arrow">→</span>
        <select className="fg-select" value={String(one.props?.action ?? "url")} onChange={(e) => setProp(one.id, "action", e.target.value)}>
          {BUTTON_ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {actionProps.filter((d) => d.key !== "action").map((d) => propField(one, d))}
      <p className="fg-muted small">Press ▶ (or P) to try it.</p>
    </Panel>
  ) : viewerProps.length ? (
    <Panel title="Overlay">{viewerProps.map((d) => propField(one, d))}<p className="fg-muted small">Folders, Starred and search results open in this window.</p></Panel>
  ) : (
    <div className="fg-empty"><div className="fg-empty-icon">◎</div><p>{part1?.name} doesn&apos;t do anything when clicked — buttons and folder windows do.</p></div>
  );

  /* ---------- right: ✨ AI ---------- */
  const suggestions = selected.length
    ? ["Make these glassy with a soft glow", "Line these up in a row", "Give these my accent colour"]
    : pieces.length ? ["Give me 3 ideas to make this better", "Make it feel cosier", "Add a focus timer and a to-do list"]
    : ["A cosy dark page with a big clock and my folders as apps", "A neon gamer page", "A clean light page like a newspaper"];
  const outOfMessages = usage !== null && !usage.unlimited && usage.left === 0;
  const aiTab = (
    <div className="fg-ai">
      <div className="fg-ai-top">
        <strong>✨ AI</strong>
        <span className={`fg-ai-left ${usage && !usage.unlimited && (usage.left || 0) <= 3 ? "low" : ""}`}>{usage ? (usage.unlimited ? "Unlimited (owner)" : `${usage.left} of ${usage.limit} left today`) : ""}</span>
      </div>
      <div className="fg-ai-log">
        {chat.length === 0 && (
          <div className="fg-ai-hello">
            <p>Tell me what you&apos;d like. I can <b>build a whole page</b>, <b>change what you&apos;ve picked</b>, or just <b>give ideas</b>.</p>
            {selected.length > 0 && <p className="fg-muted small">I&apos;ll change the {selected.length} piece{selected.length === 1 ? "" : "s"} you picked.</p>}
            <div className="fg-ai-sugs">{suggestions.map((t) => <button key={t} onClick={() => askAI(t)} disabled={aiBusy || outOfMessages || !doc}>{t}</button>)}</div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`fg-ai-msg ${m.role} ${m.error ? "error" : ""}`}>
            <p>{m.text}</p>
            {m.before && (
              <button className="fg-link" onClick={() => { const b = m.before!; setDoc(b); setChat((c) => c.map((x, j) => (j === i ? { ...x, before: undefined, text: `${x.text} (undone)` } : x))); }}>↶ Undo this</button>
            )}
          </div>
        ))}
        {aiBusy && <div className="fg-ai-msg assistant"><p className="fg-dots"><span /><span /><span /></p></div>}
        <div ref={chatEnd} />
      </div>
      <form className="fg-ai-input" onSubmit={(e) => { e.preventDefault(); askAI(aiText); }}>
        <textarea value={aiText} rows={2} maxLength={800} placeholder={selected.length ? "Change the picked pieces…" : "Describe a page, or ask anything…"}
          disabled={!doc || outOfMessages}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(aiText); } }}
          onChange={(e) => setAiText(e.target.value)} />
        <button type="submit" disabled={aiBusy || !aiText.trim()} title="Send (Enter)">↑</button>
      </form>
      <p className="fg-muted small fg-ai-note">{outOfMessages ? "You've used today's 15 — they come back tomorrow. " : ""}Uses Pollinations&apos; free AI: what you type and your design are sent to it. It can be slow or busy sometimes.</p>
    </div>
  );

  /* ---------- the canvas boxes ---------- */
  const handles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const depthOf = (p: DesignPiece) => { let n = 0, at = p; while (at.parent && byId.get(at.parent) && n < 9) { at = byId.get(at.parent)!; n++; } return n; };
  // frames first, then what's inside them (on top), so the inside can be clicked
  const boxes = pieces.map((p) => ({ p, r: rectOf(p) })).filter((x): x is { p: DesignPiece; r: Box } => !!x.r)
    .sort((a, b) => depthOf(a.p) - depthOf(b.p) || (a.p.parent ? 0 : a.p.z - b.p.z));
  // Alt: how far the picked piece is from the one under the mouse (red lines, like Figma)
  const measure = (() => {
    if (!keys.alt || !one || !hoverId || hoverId === one.id) return null;
    const a = rectOf(one), hp = byId.get(hoverId), h = hp ? rectOf(hp) : null;
    if (!a || !h) return null;
    const lines: { x1: number; y1: number; x2: number; y2: number; n: number }[] = [];
    const cy = (Math.max(a.y, h.y) + Math.min(a.y + a.h, h.y + h.h)) / 2, cx = (Math.max(a.x, h.x) + Math.min(a.x + a.w, h.x + h.w)) / 2;
    const ay = a.y + a.h / 2, ax = a.x + a.w / 2;
    const yy = Math.max(a.y, h.y) < Math.min(a.y + a.h, h.y + h.h) ? cy : ay, xx = Math.max(a.x, h.x) < Math.min(a.x + a.w, h.x + h.w) ? cx : ax;
    if (h.x >= a.x + a.w) lines.push({ x1: a.x + a.w, y1: yy, x2: h.x, y2: yy, n: h.x - a.x - a.w });
    else if (h.x + h.w <= a.x) lines.push({ x1: h.x + h.w, y1: yy, x2: a.x, y2: yy, n: a.x - h.x - h.w });
    if (h.y >= a.y + a.h) lines.push({ x1: xx, y1: a.y + a.h, x2: xx, y2: h.y, n: h.y - a.y - a.h });
    else if (h.y + h.h <= a.y) lines.push({ x1: xx, y1: h.y + h.h, x2: xx, y2: a.y, n: a.y - h.y - h.h });
    return lines;
  })();
  const cursor = keys.space || tool === "hand" ? (drag.current?.kind === "pan" ? "grabbing" : "grab") : tool !== "move" ? "crosshair" : undefined;
  const toolBtn = (t: Tool, icon: ReactNode, label: string, key: string) => (
    <button className={tool === t ? "on" : ""} title={`${label}  ${key}`} onClick={() => { setTool(t); setMode("edit"); setShapeMenu(false); }}>{icon}</button>
  );
  const selBounds = selected.length > 1 ? (() => {
    const bs = selected.map((p) => rectOf(p)).filter(Boolean) as Box[];
    if (!bs.length) return null;
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  })() : null;

  const freeNow = snap === keys.ctrl;
  const actions: Action[] = !palette || !doc ? [] : [
    { id: "dup", group: "Edit", icon: "⧉", label: "Duplicate", kbd: "Ctrl D", run: duplicateSel, off: !selected.length },
    { id: "del", group: "Edit", icon: "🗑", label: "Delete", kbd: "Del", run: removeSel, off: !selected.length },
    { id: "copy", group: "Edit", icon: "📋", label: "Copy", kbd: "Ctrl C", run: () => { clipboard.current = selected.map((p) => ({ ...p })); say("Copied"); }, off: !selected.length },
    { id: "paste", group: "Edit", icon: "📋", label: "Paste in place", kbd: "Ctrl Shift V", run: () => paste("inplace"), off: !clipboard.current.length },
    { id: "cstyle", group: "Edit", icon: "🖌", label: "Copy style", kbd: "Ctrl Alt C", run: copyStyle, off: !one },
    { id: "pstyle", group: "Edit", icon: "🎨", label: "Paste style", kbd: "Ctrl Alt V", run: pasteStyle, off: !styleClip.current || !selected.length },
    { id: "all", group: "Select", icon: "⬚", label: "Select all", kbd: "Ctrl A", run: () => setSel(pieces.filter((p) => !p.hidden && !p.parent).map((p) => p.id)) },
    { id: "match", group: "Select", icon: "⬚", label: "Select all like this", run: selectMatching, off: !one },
    { id: "none", group: "Select", icon: "⬚", label: "Select nothing", kbd: "Esc", run: () => setSel([]), off: !selected.length },
    ...(["left", "center", "right", "top", "middle", "bottom"] as const).map((k) => ({ id: `al-${k}`, group: "Arrange", icon: "⇹", label: `Align ${k === "center" ? "centres" : k === "middle" ? "middles" : k}`, run: () => align(k), off: !selected.length || (selected.length === 1 && ["top", "middle", "bottom"].includes(k)) })),
    { id: "hd", group: "Arrange", icon: "⋯", label: "Space evenly across", run: () => align("hdist"), off: selected.length < 3 },
    { id: "vd", group: "Arrange", icon: "⋮", label: "Space evenly down", run: () => align("vdist"), off: selected.length < 3 },
    { id: "tidy", group: "Arrange", icon: "▦", label: "Tidy up into a grid", kbd: "Ctrl Alt T", run: tidyUp, off: selected.length < 2 },
    { id: "front", group: "Arrange", icon: "⇡", label: "Bring to front", kbd: "Ctrl ]", run: () => layer("front"), off: !selected.length },
    { id: "back", group: "Arrange", icon: "⇣", label: "Send to back", kbd: "Ctrl [", run: () => layer("back"), off: !selected.length },
    { id: "rotr", group: "Arrange", icon: "⟳", label: "Turn right 90°", kbd: "Shift R", run: () => rotateSel(90), off: !selected.length },
    { id: "rotl", group: "Arrange", icon: "⟲", label: "Turn left 90°", kbd: "Alt Shift R", run: () => rotateSel(-90), off: !selected.length },
    { id: "rot0", group: "Arrange", icon: "0°", label: "Straighten", run: () => rotateSel(null), off: !selected.some((p) => p.style?.rotate) },
    { id: "full", group: "Arrange", icon: "⟷", label: "Make full width", run: () => updatePieces(sel, (p) => (p.parent ? p : { ...p, x: 0, w: COLS })), off: !selected.length },
    { id: "al", group: "Arrange", icon: "⬚", label: "Add auto layout", kbd: "Shift A", run: addAutoLayout },
    { id: "lock", group: "Arrange", icon: "🔒", label: "Lock / unlock", kbd: "Ctrl Shift L", run: () => updatePieces(sel, (p) => ({ ...p, locked: !p.locked || undefined })), off: !selected.length },
    { id: "hide", group: "Arrange", icon: "👁", label: "Show / hide", kbd: "Ctrl Shift H", run: () => updatePieces(sel, (p) => ({ ...p, hidden: !p.hidden || undefined })), off: !selected.length },
    { id: "snap", group: "View", icon: "🧲", label: snap ? "Turn snapping off (move freely)" : "Turn on snap to grid", kbd: "Shift G", run: () => setSnap(!snap) },
    { id: "grid", group: "View", icon: "#", label: showGrid ? "Hide grid lines" : "Show grid lines", kbd: "G", run: () => setShowGrid((g) => !g) },
    { id: "fit", group: "View", icon: "⤢", label: "Zoom to fit", kbd: "Shift 1", run: () => fit() },
    { id: "zsel", group: "View", icon: "⤢", label: "Zoom to selection", kbd: "Shift 2", run: zoomToSelection, off: !selected.length },
    { id: "z100", group: "View", icon: "⤢", label: "Zoom to 100%", kbd: "Shift 0", run: () => zoomAt(1 / cam.z, undefined, undefined, true) },
    ...DEVICES.map((d) => ({ id: `dev-${d.id}`, group: "View", icon: d.icon, label: `Show on ${d.label.toLowerCase()} (${d.w})`, run: () => setDevice(d.id), off: device === d.id })),
    { id: "try", group: "View", icon: "▶", label: mode === "try" ? "Back to editing" : "Try it out", kbd: "P", run: () => { setMode(mode === "try" ? "edit" : "try"); setSel([]); } },
    { id: "undo", group: "Edit", icon: "↶", label: "Undo", kbd: "Ctrl Z", run: undo, off: !past.length },
    { id: "redo", group: "Edit", icon: "↷", label: "Redo", kbd: "Ctrl Shift Z", run: redo, off: !future.length },
    { id: "save", group: "File", icon: "💾", label: "Save now", kbd: "Ctrl S", run: () => { setDirty(false); save().then((id) => id && say("Saved ✓")); } },
    { id: "use", group: "File", icon: "✅", label: "Use as my home page", run: applyDesign },
    { id: "ai", group: "File", icon: "✨", label: "Ask the AI", run: () => setRightTab("ai") },
    { id: "keys", group: "Help", icon: "⌨", label: "Keyboard shortcuts", kbd: "?", run: () => setModal("help") },
    ...PARTS.map((pt) => ({ id: `part-${pt.id}`, group: pt.folder.replace("Design pieces/", "◈ "), icon: pt.emoji, label: `Add ${pt.name}`, run: () => { if (mouseAt.current) addPart(pt.id, { x: mouseAt.current.px / colW, y: mouseAt.current.py / ROW }); else addPart(pt.id); } })),
  ];
  const quickBox = mode === "edit" && tool === "move" ? (selBounds || (one ? rectOf(one) : null)) : null;
  return (
    <div className={`fg-app ${freeNow ? "free" : ""}`} onPointerUp={() => onPointerUp()}
      onContextMenu={(e) => { if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault(); }}>
      {/* ---------------- left panel ---------------- */}
      <aside className="fg-left">
        <div className="fg-filehead">
          <button className={`fg-logo ${menu === "main" ? "on" : ""}`} onClick={() => setMenu(menu === "main" ? "" : "main")} title="Main menu">
            <span>🔖</span><i>▾</i>
          </button>
          <div className="fg-filename">
            <input value={doc?.name ?? "Design builder"} disabled={!doc} maxLength={40} aria-label="Design name" onChange={(e) => change((d) => ({ ...d, name: e.target.value }), false)} />
            <em className={`fg-status ${status}`}>Drafts · {statusText}</em>
          </div>
        </div>
        {menu === "main" && (
          <div className="fg-menu fg-mainmenu" onPointerDown={(e) => e.stopPropagation()}>
            <a href="/">← Back to bookmarks</a>
            <hr />
            <button onClick={() => { setMenu(""); setModal("start"); }}>New design…</button>
            <button onClick={() => { setMenu(""); refreshLists(); setGalleryTab("mine"); setModal("gallery"); }}>Open… <kbd>My designs</kbd></button>
            <button onClick={() => { setMenu(""); refreshLists(); setGalleryTab("gallery"); setModal("gallery"); }}>Gallery</button>
            <button disabled={!doc} onClick={() => { setMenu(""); if (doc) openDoc({ ...doc, id: undefined, name: `${doc.name} (copy)`.slice(0, 40), gallery: undefined }); }}>Duplicate design</button>
            <button disabled={!doc} className="danger" onClick={() => { setMenu(""); deleteDoc(); }}>Delete design</button>
            <hr />
            <button disabled={!past.length} onClick={() => { setMenu(""); undo(); }}>Undo <kbd>Ctrl Z</kbd></button>
            <button disabled={!future.length} onClick={() => { setMenu(""); redo(); }}>Redo <kbd>Ctrl Shift Z</kbd></button>
            <button disabled={!selected.length} onClick={() => { setMenu(""); duplicateSel(); }}>Duplicate <kbd>Ctrl D</kbd></button>
            <button disabled={!doc} onClick={() => { setMenu(""); addAutoLayout(); }}>Add auto layout <kbd>Shift A</kbd></button>
            <hr />
            <button onClick={() => { setMenu(""); setSnap(!snap); }}>{snap ? "✓ " : ""}Snap to grid <kbd>Shift G</kbd></button>
            <button onClick={() => { setMenu(""); setShowGrid((g) => !g); }}>{showGrid ? "✓ " : ""}Grid lines <kbd>G</kbd></button>
            <button onClick={() => { setMenu(""); fit(); }}>Zoom to fit <kbd>Shift 1</kbd></button>
            <hr />
            <button onClick={() => { setMenu(""); setModal("help"); }}>Keyboard shortcuts <kbd>?</kbd></button>
          </div>
        )}
        <div className="fg-tabs">
          <button className={leftTab === "file" ? "on" : ""} onClick={() => setLeftTab("file")}>File</button>
          <button className={leftTab === "assets" ? "on" : ""} onClick={() => setLeftTab("assets")}>Assets</button>
        </div>
        {leftTab === "file" ? (
          <div className="fg-scroll">
            <div className="fg-pages">
              <div className="fg-small-head">Pages</div>
              {DEVICES.map((d) => (
                <button key={d.id} className={device === d.id ? "on" : ""} onClick={() => setDevice(d.id)}>
                  <span className="fg-tick">{device === d.id ? "✓" : ""}</span>{d.icon} {d.label}<em>{d.w}</em>
                </button>
              ))}
            </div>
            <div className="fg-small-head fg-layerhead">Layers <em>{pieces.length}</em></div>
            {pieces.length > 0 && <input className="fg-input fg-layersearch" placeholder="Find a layer…" value={layerQ} onChange={(e) => setLayerQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setLayerQ(""); }} />}
            <div className="fg-layers" onDragOver={(e) => e.preventDefault()}>
              {topLayers.length === 0 && <p className="fg-muted pad small">Nothing here yet. Open Assets (Shift I) and drag parts onto the page, or ask ✨ AI.</p>}
              {layerQ.trim() ? (() => {
                const qq = layerQ.trim().toLowerCase();
                const hits = [...pieces].sort((a, b) => b.z - a.z).filter((p) => `${p.name || ""} ${PART_BY_ID.get(p.part)?.name || p.part}`.toLowerCase().includes(qq));
                return hits.length ? hits.map((p) => layerRow(p, 0, true)) : <p className="fg-muted pad small">No layer called that.</p>;
              })() : topLayers.map((p) => layerRow(p, 0))}
            </div>
          </div>
        ) : (
          <div className="fg-scroll">
            <input className="fg-input fg-asearch" placeholder={`Search ${PARTS.length} assets`} value={q} onChange={(e) => setQ(e.target.value)} />
            {assets}
          </div>
        )}
      </aside>

      {/* ---------------- the canvas ---------------- */}
      <main className={`fg-stage ${mode}`} ref={stageRef} style={{ cursor }} onPointerDown={onStageDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerLeave={() => { mouseAt.current = null; }}
        onContextMenu={(e) => {
          if (!doc || mode !== "edit" || (e.target as HTMLElement).closest(".fg-box,.fg-toolbar,.fg-menu,.fg-qbar,.fg-previewsel")) return;
          e.preventDefault();
          setSel([]);
          const sr = stageRef.current!.getBoundingClientRect();
          const w = overlayRef.current ? toWorld(e.clientX, e.clientY) : null;
          setCtxMenu({ x: e.clientX - sr.left, y: e.clientY - sr.top, empty: true, wx: w?.px, wy: w?.py });
        }}>
        {doc ? (
          <div className={`fg-world ${animate ? "anim" : ""}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
            <div className="fg-framelabel" style={{ transform: `scale(${1 / cam.z})` }} onPointerDown={(e) => { e.stopPropagation(); setSel([]); }}>
              {DEVICES.find((d) => d.id === device)!.label} <em>{deviceW} × {Math.round(rows * ROW)}</em>
            </div>
            <div className="fg-frame" style={{ width: deviceW, height: frameH }}>
              <iframe ref={iframeRef} className="fg-iframe" src="/?builder=preview" title="Your design" style={{ width: deviceW, height: frameH }} tabIndex={mode === "try" ? 0 : -1} />
              {editing && (
                <div ref={overlayRef} className={`fg-overlay ${showGrid && !freeNow ? "grid" : ""}`} style={{ "--colw": `${colW}px`, "--z": 1 / cam.z } as CSSProperties}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-part")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("application/x-part");
                    if (!id) return;
                    e.preventDefault();
                    const { px: wx, py: wy } = toWorld(e.clientX, e.clientY);
                    const into = frameAt(wx, wy, new Set());
                    const p = addPart(id, { x: wx / colW, y: wy / ROW });
                    // dropped onto an auto layout frame: it goes inside
                    if (p && into) change((d) => insertInto(d, p, into.stack, into.index), false);
                  }}>
                  <div className="fg-pagebottom" style={{ top: rows * ROW }}><span>end of page</span></div>
                  {boxes.map(({ p, r }) => {
                    const part = PART_BY_ID.get(p.part);
                    const on = sel.includes(p.id);
                    const popup = VIEWERS.includes(p.part) && p.props?.mode !== "inline";
                    const isStack = p.part === "stack";
                    return (
                      <div key={p.id} className={`fg-box ${on ? "on" : ""} ${hoverId === p.id ? "hover" : ""} ${p.locked ? "locked" : ""} ${p.hidden ? "hidden" : ""} ${part?.design ? "comp" : ""} ${popup ? "popup" : ""} ${isStack ? "stack" : ""} ${p.parent ? "child" : ""} ${ghost && drag.current?.start.has(p.id) ? "lifting" : ""}`}
                        style={{ left: r.x, top: r.y, width: r.w, height: r.h, transform: p.style?.rotate ? `rotate(${p.style.rotate}deg)` : undefined }}
                        onPointerEnter={() => setHoverId(p.id)} onPointerLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                        onPointerDown={(e) => startMove(e, p)}
                        onDoubleClick={() => { if (isStack) { const kids = childrenOf(p.id); if (kids.length) setSel([kids[0].id]); } else { setLeftTab("file"); setRenaming(p.id); } }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!sel.includes(p.id)) setSel([p.id]); const sr = stageRef.current!.getBoundingClientRect(); const w = toWorld(e.clientX, e.clientY); setCtxMenu({ x: e.clientX - sr.left, y: e.clientY - sr.top, wx: w.px, wy: w.py }); }}>
                        {(on || hoverId === p.id || popup || (isStack && !p.parent)) && (
                          <span className="fg-box-tag" style={p.style?.rotate ? { transform: `rotate(${-p.style.rotate}deg)`, transformOrigin: "0 100%" } : undefined} onPointerDown={popup ? (e) => startMove(e, p) : undefined}>{p.locked ? "🔒 " : ""}{isStack ? "⬚ " : part?.design ? "◈ " : ""}{p.name || part?.name}{popup ? " · pop-up" : ""}</span>
                        )}
                        {on && sel.length === 1 && !p.locked && handles.map((h) => <span key={h} className={`fg-handle ${h}`} onPointerDown={(e) => startResize(e, p, h)} />)}
                        {on && sel.length === 1 && !p.locked && !p.parent && <span className="fg-rotate" title="Drag to turn (Shift: 15° steps)" onPointerDown={(e) => startRotate(e, p)} />}
                        {on && sel.length === 1 && <span className="fg-size" style={p.style?.rotate ? { transform: `translateX(-50%) rotate(${-p.style.rotate}deg)` } : undefined}>{dragging === "move" ? `X ${Math.round(r.x)}  Y ${Math.round(r.y)}` : dragging === "rotate" ? `${p.style?.rotate || 0}°` : `${Math.round(r.w)} × ${Math.round(r.h)}`}{!dragging && (p.sizeW === "fill" ? " · Fill" : p.sizeW === "hug" ? " · Hug" : "")}{!dragging && p.style?.rotate ? ` · ${p.style.rotate}°` : ""}</span>}
                      </div>
                    );
                  })}
                  {selBounds && <div className="fg-groupbox" style={{ left: selBounds.x, top: selBounds.y, width: selBounds.w, height: selBounds.h }} />}
                  {quickBox && !dragging && !marquee && (
                    <div className="fg-qbar" style={{ left: quickBox.x + quickBox.w / 2, top: Math.max(quickBox.y, 0) }} onPointerDown={(e) => e.stopPropagation()}>
                      <button title="Duplicate  Ctrl D (or Alt + drag)" onClick={duplicateSel}>⧉</button>
                      <button title="Bring to front  Ctrl ]" onClick={() => layer("front")}>⇡</button>
                      <button title="Send to back  Ctrl [" onClick={() => layer("back")}>⇣</button>
                      <button title="Turn 90°  Shift R" onClick={() => rotateSel(90)}>⟳</button>
                      {selected.length > 1 && <><i /><button title="Align left" onClick={() => align("left")}>⇤</button><button title="Align centres" onClick={() => align("center")}>⇹</button><button title="Align top" onClick={() => align("top")}>⤒</button><button title="Tidy up  Ctrl Alt T" onClick={tidyUp}>▦</button></>}
                      <i />
                      <button title="Copy style  Ctrl Alt C" disabled={!one} onClick={copyStyle}>🖌</button>
                      <button title="Paste style  Ctrl Alt V" disabled={!styleClip.current} onClick={pasteStyle}>🎨</button>
                      <button title={selected.every((p) => p.locked) ? "Unlock  Ctrl Shift L" : "Lock  Ctrl Shift L"} onClick={() => updatePieces(sel, (p) => ({ ...p, locked: !p.locked || undefined }))}>{selected.every((p) => p.locked) ? "🔒" : "🔓"}</button>
                      <button title="✨ Ask AI about this" onClick={() => setRightTab("ai")}>✨</button>
                      <button className="danger" title="Delete  Del" onClick={removeSel}>🗑</button>
                    </div>
                  )}
                  {guides.v.map((x) => <span key={`v${x}`} className="fg-guide v" style={{ left: x }} />)}
                  {guides.h.map((y) => <span key={`h${y}`} className="fg-guide h" style={{ top: y }} />)}
                  {measure?.map((l, i) => (
                    <span key={i} className={`fg-measure ${l.x1 === l.x2 ? "v" : "h"}`} style={{ left: Math.min(l.x1, l.x2), top: Math.min(l.y1, l.y2), width: Math.abs(l.x2 - l.x1), height: Math.abs(l.y2 - l.y1) }}>
                      <b>{Math.round(l.n)}</b>
                    </span>
                  ))}
                  {dropInto && (() => { const st = byId.get(dropInto.stack); const r = st ? rectOf(st) : null; return r ? <span className="fg-droptarget" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} /> : null; })()}
                  {dropInto && <span className="fg-insert" style={{ left: dropInto.line.x, top: dropInto.line.y, width: dropInto.line.w, height: dropInto.line.h }} />}
                  {ghost && <span className="fg-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} />}
                  {marquee && <span className="fg-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
                  {drawBox && <span className={`fg-drawbox ${tool}`} style={{ left: drawBox.x, top: drawBox.y, width: drawBox.w, height: drawBox.h }} />}
                </div>
              )}
            </div>
          </div>
        ) : <div className="fg-empty-stage"><button className="fg-btn primary" onClick={() => setModal("start")}>Start a design</button></div>}

        {ctxMenu?.empty && (
          <div className="fg-menu fg-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} onPointerDown={(e) => e.stopPropagation()}>
            <button disabled={!clipboard.current.length} onClick={() => { paste(ctxMenu.wx !== undefined ? { px: ctxMenu.wx, py: ctxMenu.wy! } : "mouse"); setCtxMenu(null); }}>Paste here <kbd>Ctrl V</kbd></button>
            <button disabled={!clipboard.current.length} onClick={() => { paste("inplace"); setCtxMenu(null); }}>Paste in place <kbd>Ctrl Shift V</kbd></button>
            <button onClick={() => { setSel(pieces.filter((p) => !p.hidden && !p.parent).map((p) => p.id)); setCtxMenu(null); }}>Select all <kbd>Ctrl A</kbd></button>
            <hr />
            <button onClick={() => { setCtxMenu(null); setPalette(true); }}>Quick actions… <kbd>Ctrl K</kbd></button>
            <button onClick={() => { setCtxMenu(null); setLeftTab("assets"); }}>Add a part… <kbd>Shift I</kbd></button>
            <hr />
            <button onClick={() => { setSnap(!snap); setCtxMenu(null); }}>{snap ? "✓ " : ""}Snap to grid <kbd>Shift G</kbd></button>
            <button onClick={() => { setShowGrid((g) => !g); setCtxMenu(null); }}>{showGrid ? "✓ " : ""}Grid lines <kbd>G</kbd></button>
            <button onClick={() => { fit(); setCtxMenu(null); }}>Zoom to fit <kbd>Shift 1</kbd></button>
          </div>
        )}
        {ctxMenu && !ctxMenu.empty && (
          <div className="fg-menu fg-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => { clipboard.current = selected.map((p) => ({ ...p })); setCtxMenu(null); say("Copied"); }}>Copy <kbd>Ctrl C</kbd></button>
            <button disabled={!clipboard.current.length} onClick={() => { paste(ctxMenu.wx !== undefined ? { px: ctxMenu.wx, py: ctxMenu.wy! } : "mouse"); setCtxMenu(null); }}>Paste here <kbd>Ctrl V</kbd></button>
            <button disabled={!one} onClick={() => { copyStyle(); setCtxMenu(null); }}>Copy style <kbd>Ctrl Alt C</kbd></button>
            <button disabled={!styleClip.current} onClick={() => { pasteStyle(); setCtxMenu(null); }}>Paste style <kbd>Ctrl Alt V</kbd></button>
            <button onClick={() => { duplicateSel(); setCtxMenu(null); }}>Duplicate <kbd>Ctrl D</kbd></button>
            <button className="danger" onClick={() => { removeSel(); setCtxMenu(null); }}>Delete <kbd>Del</kbd></button>
            <hr />
            <button onClick={() => { layer("front"); setCtxMenu(null); }}>Bring to front <kbd>Ctrl ]</kbd></button>
            <button onClick={() => { layer("back"); setCtxMenu(null); }}>Send to back <kbd>Ctrl [</kbd></button>
            <hr />
            <button onClick={() => { addAutoLayout(); setCtxMenu(null); }}>Add auto layout <kbd>Shift A</kbd></button>
            {one?.part === "stack" && <button onClick={() => { removeAutoLayout(one.id); setCtxMenu(null); }}>Remove auto layout <kbd>Alt Shift A</kbd></button>}
            <button onClick={() => { zoomToSelection(); setCtxMenu(null); }}>Zoom to selection <kbd>Shift 2</kbd></button>
            <button onClick={() => { rotateSel(90); setCtxMenu(null); }}>Turn 90° <kbd>Shift R</kbd></button>
            {selected.some((p) => p.style?.rotate) && <button onClick={() => { rotateSel(null); setCtxMenu(null); }}>Straighten</button>}
            {selected.length > 1 && <button onClick={() => { tidyUp(); setCtxMenu(null); }}>Tidy up <kbd>Ctrl Alt T</kbd></button>}
            <hr />
            {one && <button onClick={() => { selectMatching(); setCtxMenu(null); }}>Select all like this</button>}
            {one && <button onClick={() => { setLeftTab("file"); setLayerQ(""); setRenaming(one.id); setCtxMenu(null); }}>Rename</button>}
            <button onClick={() => { updatePieces(sel, (p) => ({ ...p, hidden: !p.hidden || undefined })); setCtxMenu(null); }}>Show / hide <kbd>Ctrl Shift H</kbd></button>
            <button onClick={() => { updatePieces(sel, (p) => ({ ...p, locked: !p.locked || undefined })); setCtxMenu(null); }}>Lock / unlock <kbd>Ctrl Shift L</kbd></button>
            <button onClick={() => { setRightTab("ai"); setCtxMenu(null); }}>✨ Ask AI about this</button>
          </div>
        )}

        {doc && (
          <div className="fg-toolbar">
            {toolBtn("move", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l12 7.5-5.4 1.6L10 18z" /></svg>, "Move", "V")}
            {toolBtn("hand", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V5.5a1.5 1.5 0 013 0V11m0-1V4.5a1.5 1.5 0 013 0V11m0-.5V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7s-5-1.5-7-5l-1.5-3a1.4 1.4 0 012.4-1.4L8 13" /></svg>, "Hand", "H")}
            <span className="fg-tsep" />
            {toolBtn("frame", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v18M16 3v18M3 8h18M3 16h18" /></svg>, "Frame (auto layout)", "F")}
            <div className="fg-tgroup">
              <button className={["rect", "ellipse", "line"].includes(tool) ? "on" : ""} title="Shapes" onClick={() => { setTool(["rect", "ellipse", "line"].includes(tool) ? tool : "rect"); setMode("edit"); }}>
                {tool === "ellipse" ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" /></svg> : tool === "line" ? <svg viewBox="0 0 24 24"><path d="M5 19L19 5" /></svg> : <svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="1" /></svg>}
              </button>
              <button className="fg-tcaret" title="More shapes" onClick={() => setShapeMenu(!shapeMenu)}>▾</button>
              {shapeMenu && (
                <div className="fg-menu fg-shapemenu">
                  <button onClick={() => { setTool("rect"); setShapeMenu(false); }}>▭ Rectangle <kbd>R</kbd></button>
                  <button onClick={() => { setTool("ellipse"); setShapeMenu(false); }}>○ Ellipse <kbd>O</kbd></button>
                  <button onClick={() => { setTool("line"); setShapeMenu(false); }}>╱ Line <kbd>L</kbd></button>
                </div>
              )}
            </div>
            {toolBtn("text", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" /></svg>, "Text", "T")}
            <button className={snap ? "on" : ""} title={snap ? "Snapping to the grid (Shift G to move freely)" : "Moving freely (Shift G to snap to the grid)"} aria-pressed={snap} onClick={() => { setSnap(!snap); say(snap ? "Moving freely" : "Snapping to the grid"); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4" /></svg>
            </button>
            <span className="fg-tsep" />
            <button title="Assets  Shift I" className={leftTab === "assets" ? "soft" : ""} onClick={() => setLeftTab("assets")}><svg viewBox="0 0 24 24"><path d="M12 3l3 3-3 3-3-3zM6 9l3 3-3 3-3-3zM18 9l3 3-3 3-3-3zM12 15l3 3-3 3-3-3z" /></svg></button>
            <button title="✨ AI" className={`fg-tai ${rightTab === "ai" ? "on" : ""}`} onClick={() => setRightTab(rightTab === "ai" ? "design" : "ai")}>✨</button>
            <span className="fg-tsep" />
            <button className={mode === "try" ? "on" : ""} title="Try it — click around for real  P" onClick={() => { setMode(mode === "try" ? "edit" : "try"); setSel([]); }}><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg></button>
          </div>
        )}
        {doc && (
          <div className="fg-hint">
            {device === "phone" ? "📲 On phones pieces stack top to bottom — pick a bigger page to move things."
              : mode === "try" ? "▶ Trying it out — click around like it's your real page. Press P to edit again."
              : tool !== "move" && tool !== "hand" ? "Drag on the page to draw · Esc to cancel"
              : keys.ctrl ? (snap ? "Moving freely while you hold Ctrl" : "Snapping to the grid while you hold Ctrl")
              : keys.alt && one ? "Point at another piece to see the distance"
              : snap ? "Snapping to the grid · hold Ctrl to move freely · Shift G turns snapping off · Space + drag to pan"
              : "Drag anything anywhere · red lines show when edges line up · Shift G snaps to a grid · Space + drag to pan"}
          </div>
        )}
        {doc && (
          <select className="fg-previewsel" value={previewState} onChange={(e) => setPreviewState(e.target.value as typeof previewState)} title="Preview how pop-ups and search look">
            <option value="home">Preview: Home</option>
            <option value="folder">Preview: a folder open</option>
            <option value="search">Preview: searching</option>
          </select>
        )}
      </main>

      {/* ---------------- right panel ---------------- */}
      <aside className="fg-right">
        <div className="fg-righthead">
          <span className="fg-avatar" title={me.user}>{me.user[0]?.toUpperCase()}</span>
          <span className="fg-flex" />
          <button className={`fg-play ${mode === "try" ? "on" : ""}`} title="Try it (P)" onClick={() => { setMode(mode === "try" ? "edit" : "try"); setSel([]); }}><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" /></svg></button>
          <button className="fg-btn ghost sm" title="Use this design as your home page" onClick={applyDesign} disabled={!doc}>Use</button>
          <button className="fg-btn primary sm" onClick={() => setModal("share")} disabled={!doc}>Share</button>
        </div>
        <div className="fg-tabs right">
          <button className={rightTab === "design" ? "on" : ""} onClick={() => setRightTab("design")}>Design</button>
          <button className={rightTab === "prototype" ? "on" : ""} onClick={() => setRightTab("prototype")}>Prototype</button>
          <button className={rightTab === "ai" ? "on" : ""} onClick={() => setRightTab("ai")}>✨ AI</button>
          <span className="fg-flex" />
          <div className="fg-zoomwrap">
            <button className="fg-zoombtn" onClick={() => setMenu(menu === "zoom" ? "" : "zoom")}>{Math.round(cam.z * 100)}%<i>▾</i></button>
            {menu === "zoom" && (
              <div className="fg-menu fg-zoommenu" onPointerDown={(e) => e.stopPropagation()}>
                <button onClick={() => { zoomAt(1.25, undefined, undefined, true); setMenu(""); }}>Zoom in <kbd>Ctrl +</kbd></button>
                <button onClick={() => { zoomAt(0.8, undefined, undefined, true); setMenu(""); }}>Zoom out <kbd>Ctrl −</kbd></button>
                <button onClick={() => { fit(); setMenu(""); }}>Zoom to fit <kbd>Shift 1</kbd></button>
                <button disabled={!selected.length} onClick={() => { zoomToSelection(); setMenu(""); }}>Zoom to selection <kbd>Shift 2</kbd></button>
                <hr />
                {[0.5, 1, 2].map((z) => <button key={z} onClick={() => { zoomAt(z / cam.z, undefined, undefined, true); setMenu(""); }}>Zoom to {z * 100}% {z === 1 && <kbd>Shift 0</kbd>}</button>)}
              </div>
            )}
          </div>
        </div>
        <div className={`fg-scroll ${rightTab === "ai" ? "noscroll" : ""}`}>
          {rightTab === "design" ? designTab : rightTab === "prototype" ? protoTab : aiTab}
        </div>
      </aside>

      {toast && <div className="fg-toast" role="status">{toast}</div>}

      {palette && <QuickActions items={actions} onClose={() => setPalette(false)} />}

      {/* ---------------- new design / designs / share / shortcuts ---------------- */}
      {modal === "start" && (
        <div className="fg-modal-bg" onClick={() => doc && setModal("")}>
          <div className="fg-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="fg-modal-top"><h2>New design</h2>{doc && <button className="fg-x" onClick={() => setModal("")} aria-label="Close">×</button>}</div>
            <p className="fg-muted">Start from a blank page or any of the site&apos;s designs — already rebuilt out of pieces you can move. Or ask ✨ AI once you&apos;re in.</p>
            <div className="fg-tpls">
              {TEMPLATE_LIST.map(([k, l, e]) => (
                <button key={k} className="fg-tpl" onClick={() => newFromTemplate(k)}>
                  <DesignMini d={templateDesign(k)} />
                  <strong>{e} {l}</strong>
                </button>
              ))}
            </div>
            {(lists?.mine.length || 0) > 0 && (
              <>
                <h3>Recents</h3>
                <div className="fg-tpls">
                  {lists!.mine.map((d) => (
                    <button key={d.id} className="fg-tpl" onClick={() => openDoc(d)}>
                      <DesignMini d={d} />
                      <strong>{d.emoji} {d.name}</strong>
                      <em>{d.gallery === "approved" ? "🌍 In the gallery" : d.gallery === "pending" ? "⏳ Waiting for a check" : "Only you"}</em>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="fg-modal-foot"><button className="fg-btn ghost" onClick={() => { setGalleryTab("gallery"); setModal("gallery"); }}>🌍 Browse the gallery</button></div>
          </div>
        </div>
      )}
      {modal === "gallery" && (
        <div className="fg-modal-bg" onClick={() => setModal(doc ? "" : "start")}>
          <div className="fg-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="fg-modal-top">
              <h2>Designs</h2>
              <Seg value={galleryTab} onChange={setGalleryTab} options={[
                ["mine", `Mine (${lists?.mine.length || 0})`], ["gallery", `🌍 Gallery (${lists?.gallery.length || 0})`],
                ...(staff ? [["pending", `🛡️ To check (${lists?.pending?.length || 0})`] as ["pending", string]] : []),
              ]} />
              <button className="fg-x" onClick={() => setModal(doc ? "" : "start")} aria-label="Close">×</button>
            </div>
            <div className="fg-gallery">
              {(galleryTab === "mine" ? lists?.mine : galleryTab === "pending" ? lists?.pending : lists?.gallery)?.map((d) => (
                <div key={d.id} className="fg-gcard">
                  <DesignMini d={d} />
                  <strong>{d.emoji} {d.name}</strong>
                  <em>{galleryTab === "mine" ? (d.gallery === "approved" ? "🌍 Shared" : d.gallery === "pending" ? "⏳ Waiting for a check" : "🔒 Only you") : `by ${d.owner} · used ${d.uses || 0}×`}{lists?.siteDefault === d.id ? " · ⭐ site default" : ""}</em>
                  {d.description && <p>{d.description}</p>}
                  <div className="fg-gcard-actions">
                    {galleryTab === "mine" ? (
                      <>
                        <button className="fg-btn primary sm" onClick={() => openDoc(d)}>Open</button>
                        <button className="fg-btn sm" onClick={() => switchTo(d.id)}>Use</button>
                        <button className="fg-btn ghost sm" onClick={async () => { if (confirm(`Delete “${d.name}”?`)) { await galleryAction("delete", d.id, "Deleted"); if (docRef.current?.id === d.id) { docRef.current = null; setDocState(null); setModal("start"); } } }}>Delete</button>
                      </>
                    ) : galleryTab === "pending" ? (
                      <>
                        <button className="fg-btn primary sm" onClick={() => galleryAction("approve", d.id, "✅ Approved — it's in the gallery")}>Approve</button>
                        <button className="fg-btn sm" onClick={() => galleryAction("reject", d.id, "Sent back — it stays private")}>Not okay</button>
                        <button className="fg-btn ghost sm" onClick={() => window.open(`/?design=${d.id}`, "_blank")}>Try it</button>
                      </>
                    ) : (
                      <>
                        <button className="fg-btn primary sm" onClick={() => switchTo(d.id)}>Use it</button>
                        <button className="fg-btn sm" onClick={async () => { const r = await galleryAction("copy", d.id, "Copied — it's yours to change"); if (r?.saved) openDoc(r.saved); }}>Copy &amp; edit</button>
                        {staff && <button className="fg-btn ghost sm" onClick={() => galleryAction("unshare", d.id, "Taken out of the gallery")}>Remove</button>}
                        {isAdmin && <button className="fg-btn ghost sm" onClick={() => setSiteDefault(lists?.siteDefault === d.id ? "" : d.id)}>{lists?.siteDefault === d.id ? "★ Default" : "☆ Make default"}</button>}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {((galleryTab === "mine" ? lists?.mine : galleryTab === "pending" ? lists?.pending : lists?.gallery)?.length || 0) === 0 && (
                <p className="fg-muted">{galleryTab === "mine" ? "You haven't made any designs yet." : galleryTab === "pending" ? "Nothing waiting — all checked! ✨" : "Nobody has shared a design yet — be the first! 🌍"}</p>
              )}
            </div>
            <div className="fg-modal-foot"><button className="fg-btn" onClick={() => setModal("start")}>+ New design</button></div>
          </div>
        </div>
      )}
      {modal === "share" && doc && (
        <div className="fg-modal-bg" onClick={() => setModal("")}>
          <div className="fg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fg-modal-top"><h2>Share “{doc.name}”</h2><button className="fg-x" onClick={() => setModal("")} aria-label="Close">×</button></div>
            <div className="fg-sharebox">
              <span className="fg-avatar">{me.user[0]?.toUpperCase()}</span>
              <div><strong>{me.user} (you)</strong><em>owner</em></div>
            </div>
            {doc.gallery === "approved" ? (
              <><p>🌍 It&apos;s in the gallery — anyone can use it or make a copy. If you change it, a moderator checks it again.</p><button className="fg-btn" onClick={() => share(false)}>Take it out of the gallery</button></>
            ) : doc.gallery === "pending" ? (
              <><p>⏳ Waiting for a moderator to check it.</p><button className="fg-btn" onClick={() => share(false)}>Cancel sharing</button></>
            ) : (
              <><p>Put it in the gallery so others can use it or copy it. A moderator checks it first.</p><button className="fg-btn primary" onClick={() => share(true)}>🌍 Share to the gallery</button></>
            )}
            {doc.id && (
              <div className="fg-copyrow">
                <input className="fg-input" readOnly value={`${location.origin}/?design=${doc.id}`} onFocus={(e) => e.target.select()} />
                <button className="fg-btn" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/?design=${doc.id}`); say("Link copied"); }}>🔗 Copy link</button>
              </div>
            )}
            <div className="fg-modal-foot"><button className="fg-btn primary" onClick={applyDesign}>✅ Use as my home page</button></div>
          </div>
        </div>
      )}
      {modal === "help" && (
        <div className="fg-modal-bg" onClick={() => setModal("")}>
          <div className="fg-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="fg-modal-top"><h2>Keyboard shortcuts</h2><button className="fg-x" onClick={() => setModal("")} aria-label="Close">×</button></div>
            <div className="fg-keys">
              {([
                ["Tools", [["V", "Move"], ["H / Space", "Hand (pan)"], ["F", "Frame (auto layout)"], ["R", "Rectangle"], ["O", "Ellipse"], ["L", "Line"], ["T", "Text"], ["Shift I", "Assets"], ["P", "Try it"]]],
                ["Edit", [["Ctrl Z / Ctrl Shift Z", "Undo / redo"], ["Ctrl C / V / X", "Copy / paste / cut"], ["Ctrl D", "Duplicate"], ["Del", "Delete"], ["Ctrl A", "Select all"], ["Esc", "Select the frame, then nothing"], ["Enter", "Select inside a frame"], ["Ctrl Shift L / H", "Lock / hide"], ["Ctrl K", "Quick actions (find anything)"], ["Ctrl Shift V", "Paste in place"], ["Ctrl Alt C / V", "Copy / paste style"], ["Tab", "Pick the next piece"]]],
                ["Arrange", [["Shift A", "Add auto layout"], ["Alt Shift A", "Remove auto layout"], ["[ ]", "Backward / forward"], ["Ctrl [ ]", "To back / front"], ["Arrows", "Nudge 1px (Shift = 10px)"], ["Shift G", "Snap to grid on / off"], ["Ctrl + drag", "Flip snapping while dragging"], ["Alt + drag", "Drag a copy"], ["Shift + drag", "Move straight across or down"], ["Shift + corner", "Resize keeping its shape"], ["Alt + resize", "Resize from the middle"], ["Shift R / Alt Shift R", "Turn 90° right / left"], ["Ctrl Alt T", "Tidy up"], ["Esc (while dragging)", "Cancel the drag"], ["Alt + point", "Measure distance"]]],
                ["View", [["Scroll", "Move around"], ["Ctrl + scroll", "Zoom"], ["Shift 1", "Zoom to fit"], ["Shift 2", "Zoom to selection"], ["Shift 0", "100%"], ["G", "Grid lines"]]],
              ] as [string, string[][]][]).map(([title, list]) => (
                <div key={title}>
                  <h3>{title}</h3>
                  {list.map(([k, v]) => <div key={k} className="fg-key"><span>{v}</span><kbd>{k}</kbd></div>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
