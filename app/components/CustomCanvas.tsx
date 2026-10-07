"use client";
import { CSSProperties, ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { BuiltDesign, COLS, DesignPiece, FONT_CHOICES, GLASS_DESIGNS, PART_BY_ID, PartDef, PieceStyle, ROW, safeImageUrl } from "@/lib/pieces";
import { DESIGN_FONTS, Design, ensureFont } from "./look";

/**
 * Draws a design made in the design builder: a stretchy grid with every
 * piece where it was put, and auto layout frames that line their pieces
 * up in a row or a column. On phones the pieces stack top to bottom
 * instead (small ones sit side by side). The home page says what each
 * piece shows through `render`.
 */
export const fontFamily = (id?: string) => FONT_CHOICES.find((f) => f.id === id)?.family;
export type Rects = Record<string, { x: number; y: number; w: number; h: number }>;

export function useDesignFonts(design: Pick<BuiltDesign, "canvas" | "pieces"> | null) {
  const key = design ? [design.canvas.font, ...design.pieces.map((p) => `${p.style?.font || ""}|${PART_BY_ID.get(p.part)?.design || ""}`)].join(",") : "";
  useEffect(() => {
    if (!design) return;
    const fonts = new Set<string>([design.canvas.font]);
    const designs = new Set<string>();
    for (const p of design.pieces) {
      if (p.style?.font) fonts.add(p.style.font);
      const d = PART_BY_ID.get(p.part)?.design;
      if (d) designs.add(d);
    }
    for (const f of Array.from(fonts)) { const c = FONT_CHOICES.find((x) => x.id === f); if (c?.google) ensureFont(c.google, `cz-${c.id}`); }
    // blended pieces use the page's font, so their own only loads when they keep their look
    for (const d of Array.from(designs)) { const g = DESIGN_FONTS[d as Design]; if (g) ensureFont(g, `cz-d-${d}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const SHADOWS: Record<string, string> = {
  soft: "0 8px 24px rgba(0,0,0,.18)",
  strong: "0 18px 50px rgba(0,0,0,.42)",
  glow: "0 0 0 1px color-mix(in srgb,var(--accent) 40%,transparent),0 0 34px color-mix(in srgb,var(--accent) 45%,transparent)",
};

/** How a piece's box looks: fill, glass, corners, border, shadow, padding, see-through. */
function boxLook(s: PieceStyle): CSSProperties {
  const css: CSSProperties = {};
  if (s.glass) {
    css.background = s.bg ? `color-mix(in srgb, ${s.bg} 45%, transparent)` : "color-mix(in srgb, var(--cz-text, #fff) 8%, transparent)";
    css.backdropFilter = "blur(18px) saturate(1.4)";
    css.WebkitBackdropFilter = "blur(18px) saturate(1.4)";
  } else if (s.bg) css.background = s.bg;
  if (s.radius !== undefined) css.borderRadius = s.radius;
  if (s.borderWidth) css.border = `${s.borderWidth}px solid ${s.borderColor || "color-mix(in srgb, currentColor 25%, transparent)"}`;
  if (s.shadow && s.shadow !== "none") css.boxShadow = SHADOWS[s.shadow];
  if (s.pad !== undefined) css.padding = s.pad;
  if (s.opacity !== undefined && s.opacity < 1) css.opacity = s.opacity;
  return css;
}

/** A piece placed on the page: where it sits and how big it is. */
export function pieceBoxStyle(p: DesignPiece, order?: number): CSSProperties {
  return {
    left: `${(p.x / COLS) * 100}%`,
    top: p.y * ROW,
    width: p.sizeW === "hug" ? "max-content" : `${(p.w / COLS) * 100}%`,
    maxWidth: p.sizeW === "hug" ? `${((COLS - p.x) / COLS) * 100}%` : undefined,
    height: p.sizeH === "hug" ? "auto" : p.h * ROW,
    zIndex: p.z,
    order,
    ...boxLook(p.style || {}),
  };
}
/** A piece inside an auto layout frame: the frame places it; it only says how big it is. */
function childBoxStyle(p: DesignPiece, dir: string, order: number): CSSProperties {
  const row = dir !== "column";
  const css: CSSProperties = { order, ...boxLook(p.style || {}) };
  const fixedW = `calc(100cqw / ${COLS} * ${p.w})`;
  if (p.sizeW === "fill") { if (row) { css.flex = "1 1 0"; css.minWidth = 0; } else css.alignSelf = "stretch"; } else if (p.sizeW === "hug") css.width = "max-content";
  else css.width = fixedW;
  if (p.sizeH === "fill") { if (!row) { css.flex = "1 1 0"; css.minHeight = 0; } else css.alignSelf = "stretch"; } else if (p.sizeH === "hug") css.height = "auto";
  else css.height = p.h * ROW;
  if (css.width === fixedW) css.flexShrink = 0;
  return css;
}
export function pieceInnerStyle(p: DesignPiece): CSSProperties {
  const s = p.style || {};
  const css: Record<string, string | number> = {};
  if (s.text) { css.color = s.text; css["--text"] = s.text; }
  if (s.accent) { css["--accent"] = s.accent; css["--accent-dim"] = `${s.accent}26`; }
  if (s.font) css.fontFamily = fontFamily(s.font) || "";
  if (s.size && s.size !== 100) css.zoom = s.size / 100;
  if (s.radius !== undefined) css.borderRadius = s.radius;
  return css as CSSProperties;
}

const PATTERNS: Record<string, string> = {
  dots: "radial-gradient(color-mix(in srgb,var(--cz-text) 14%,transparent) 1px,transparent 1.4px) 0 0/22px 22px",
  grid: "linear-gradient(color-mix(in srgb,var(--cz-text) 7%,transparent) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,color-mix(in srgb,var(--cz-text) 7%,transparent) 1px,transparent 1px) 0 0/28px 28px",
  gradient: "linear-gradient(160deg,color-mix(in srgb,var(--cz-accent) 22%,transparent),transparent 55%)",
  aurora: "radial-gradient(900px 500px at 15% -5%,color-mix(in srgb,var(--cz-accent) 35%,transparent),transparent 65%),radial-gradient(700px 500px at 95% 10%,color-mix(in srgb,#ff5c9a 22%,transparent),transparent 60%),radial-gradient(800px 600px at 50% 110%,color-mix(in srgb,#3dd68c 16%,transparent),transparent 60%)",
  stripes: "repeating-linear-gradient(135deg,color-mix(in srgb,var(--cz-text) 4%,transparent) 0 14px,transparent 14px 28px)",
};

/**
 * The page's whole colour set, worked out from its background, text and
 * accent, so the site's own cards, buttons and menus — and pieces from any
 * design — all match.
 */
export function palette(c: BuiltDesign["canvas"]): Record<string, string> {
  const mix = (pct: number, a = c.text, b = c.bg) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  const font = fontFamily(c.font) || "inherit";
  return {
    "--bg": c.bg, "--bg2": mix(4), "--surface": mix(6), "--surface-hover": mix(11), "--border": mix(13), "--border-light": mix(22),
    "--text": c.text, "--text-muted": mix(62), "--primary-bg": c.text, "--primary-fg": c.bg, "--primary-hover": mix(85),
    "--accent": c.accent, "--accent-hover": `color-mix(in srgb, ${c.accent} 85%, ${c.text})`, "--accent-dim": `color-mix(in srgb, ${c.accent} 18%, transparent)`,
    // each design's own names for its colours and fonts
    "--j-rule": c.text, "--j-serif": font, "--j-body": font, "--t-mono": font, "--t-dir": c.accent, "--t-glow": "none", "--font-display": font, "--font": font,
  };
}

/** The page-wide look: background, text colour, accent and font. */
export function canvasStyle(c: BuiltDesign["canvas"]): CSSProperties {
  const layers: string[] = [];
  if (c.bgPattern && c.bgPattern !== "none") layers.push(PATTERNS[c.bgPattern]);
  const img = safeImageUrl(c.bgImage);
  if (img) layers.push(`url("${img}") center/cover no-repeat`);
  const p = palette(c);
  return {
    ...(c.blend !== false ? p : { "--accent": c.accent, "--accent-dim": `${c.accent}26`, "--text": c.text, "--bg": c.bg }),
    "--cz-bg": c.bg, "--cz-text": c.text, "--cz-accent": c.accent,
    background: [...layers, c.bg].join(","),
    color: c.text,
    fontFamily: fontFamily(c.font),
  } as CSSProperties;
}

export const canvasRows = (d: Pick<BuiltDesign, "canvas" | "pieces">) =>
  Math.max(d.canvas.rows, ...d.pieces.filter((p) => !p.hidden && !p.parent).map((p) => Math.ceil(p.y + p.h) + 2));

export function pieceClass(p: DesignPiece, part: PartDef) {
  const phoneHide = p.style?.phone === "hide" || (part.deco && p.style?.phone !== "show");
  return [
    "cz-piece", `cz-part-${part.id}`,
    part.design ? "cz-design" : "",
    part.overflow || part.id === "stack" ? "cz-over" : "",
    part.contain ? "cz-contain" : "",
    phoneHide ? "cz-phone-hide" : "",
    p.w <= 6 && part.id !== "stack" ? "cz-small" : "",
    p.style?.bg || p.style?.glass ? "cz-ownbg" : "",
  ].filter(Boolean).join(" ");
}
export const designScope = (part: PartDef) => (part.design ? `ui-${part.design}${GLASS_DESIGNS.includes(part.design) ? " ui-glass" : ""}` : "");

const FLEX: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", between: "space-between" };

export function CustomCanvas({ design, render, className = "", children, extraClass, onLayout }: {
  design: Pick<BuiltDesign, "canvas" | "pieces">;
  render: (p: DesignPiece, part: PartDef) => ReactNode;
  className?: string;
  /** drawn after the pieces (pop-up windows and such) */
  children?: ReactNode;
  /** extra classes for a piece right now (e.g. a pop-up window that's open) */
  extraClass?: (p: DesignPiece) => string;
  /** where every piece ended up (the design builder draws its boxes from this) */
  onLayout?: (rects: Rects, height: number) => void;
}) {
  useDesignFonts(design);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rows = canvasRows(design);
  const blend = design.canvas.blend !== false;
  const pal = blend ? palette(design.canvas) : null;
  const byId = new Map(design.pieces.map((p) => [p.id, p]));
  const kids = new Map<string, DesignPiece[]>();
  for (const p of design.pieces) {
    if (!p.parent || byId.get(p.parent)?.part !== "stack") continue;
    kids.set(p.parent, [...(kids.get(p.parent) || []), p]);
  }
  const top = design.pieces.filter((p) => !p.parent || byId.get(p.parent)?.part !== "stack");
  // phones read the pieces top to bottom, left to right
  const order = new Map([...top].sort((a, b) => a.y - b.y || a.x - b.x).map((p, i) => [p.id, i]));

  const draw = (p: DesignPiece, inside?: { dir: string; i: number }): ReactNode => {
    const part = PART_BY_ID.get(p.part);
    if (!part || p.hidden) return null;
    let body: ReactNode;
    if (part.id === "stack") {
      const pr = p.props || {};
      const dir = pr.dir === "column" ? "column" : "row";
      const list = kids.get(p.id) || [];
      body = (
        <div className={`cz-stack cz-stack-${dir}`} style={{
          flexDirection: dir, gap: Number(pr.gap ?? 12), padding: Number(pr.pad ?? 12), flexWrap: pr.wrap ? "wrap" : "nowrap",
          alignItems: FLEX[String(pr.align || "start")], justifyContent: FLEX[String(pr.justify || "start")],
        }}>
          {list.map((c, i) => draw(c, { dir, i }))}
        </div>
      );
    } else {
      body = render(p, part);
      if (body === null) return null;
    }
    // pieces from other designs blend into this page unless told to keep their own look
    const mixIn = pal && part.design && !p.style?.keep;
    const inner = { ...(mixIn ? pal : {}), ...pieceInnerStyle(p) } as CSSProperties;
    return (
      <div key={p.id} className={`${pieceClass(p, part)} ${inside ? "cz-child" : ""} ${mixIn ? "cz-blended" : ""} ${extraClass?.(p) || ""}`} data-piece={p.id}
        style={inside ? childBoxStyle(p, inside.dir, inside.i) : pieceBoxStyle(p, order.get(p.id))}>
        <div className={`cz-in ${designScope(part)}`} style={inner}>
          {mixIn ? <div className="cz-blend" style={pal as CSSProperties}>{body}</div> : body}
        </div>
      </div>
    );
  };

  // tell the builder where everything landed (frames move their pieces around)
  const report = useRef(onLayout);
  report.current = onLayout;
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el || !report.current) return;
    const send = () => {
      const base = el.getBoundingClientRect();
      const rects: Rects = {};
      el.querySelectorAll<HTMLElement>("[data-piece]").forEach((n) => {
        const r = n.getBoundingClientRect();
        rects[n.dataset.piece!] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
      });
      report.current?.(rects, el.scrollHeight);
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    el.querySelectorAll("[data-piece]").forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  });

  return (
    <div className={`cz-layout ${className}`} data-tone={design.canvas.tone} style={canvasStyle(design.canvas)}>
      <div className="cz-canvas" ref={canvasRef} style={{ height: rows * ROW }}>
        {top.map((p) => draw(p))}
      </div>
      {children}
    </div>
  );
}
