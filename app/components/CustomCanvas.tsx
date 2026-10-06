"use client";
import { CSSProperties, ReactNode, useEffect } from "react";
import { BuiltDesign, COLS, DesignPiece, FONT_CHOICES, GLASS_DESIGNS, PART_BY_ID, PartDef, PieceStyle, ROW, safeImageUrl } from "@/lib/pieces";
import { DESIGN_FONTS, Design, ensureFont } from "./look";

/**
 * Draws a design made in the design builder: a stretchy grid with every
 * piece where it was put. On phones the pieces stack top to bottom
 * instead (small ones sit side by side). The home page says what each
 * piece shows through `render`.
 */
export const fontFamily = (id?: string) => FONT_CHOICES.find((f) => f.id === id)?.family;

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
    for (const d of Array.from(designs)) { const g = DESIGN_FONTS[d as Design]; if (g) ensureFont(g, `cz-d-${d}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const SHADOWS: Record<string, string> = {
  soft: "0 8px 24px rgba(0,0,0,.18)",
  strong: "0 18px 50px rgba(0,0,0,.42)",
  glow: "0 0 0 1px color-mix(in srgb,var(--accent) 40%,transparent),0 0 34px color-mix(in srgb,var(--accent) 45%,transparent)",
};

/** The outer box of a piece: where it sits and how its box looks. */
export function pieceBoxStyle(p: DesignPiece, order?: number): CSSProperties {
  const s: PieceStyle = p.style || {};
  const css: CSSProperties = {
    left: `${(p.x / COLS) * 100}%`,
    top: p.y * ROW,
    width: `${(p.w / COLS) * 100}%`,
    height: p.h * ROW,
    zIndex: p.z,
    order,
  };
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

/** The page-wide look: background, text colour, accent and font. */
export function canvasStyle(c: BuiltDesign["canvas"]): CSSProperties {
  const layers: string[] = [];
  if (c.bgPattern && c.bgPattern !== "none") layers.push(PATTERNS[c.bgPattern]);
  const img = safeImageUrl(c.bgImage);
  if (img) layers.push(`url("${img}") center/cover no-repeat`);
  return {
    "--cz-bg": c.bg, "--cz-text": c.text, "--cz-accent": c.accent,
    "--accent": c.accent, "--accent-dim": `${c.accent}26`, "--text": c.text, "--bg": c.bg,
    background: [...layers, c.bg].join(","),
    color: c.text,
    fontFamily: fontFamily(c.font),
  } as CSSProperties;
}

export const canvasRows = (d: Pick<BuiltDesign, "canvas" | "pieces">) =>
  Math.max(d.canvas.rows, ...d.pieces.filter((p) => !p.hidden).map((p) => Math.ceil(p.y + p.h) + 2));

export function pieceClass(p: DesignPiece, part: PartDef) {
  const phoneHide = p.style?.phone === "hide" || (part.deco && p.style?.phone !== "show");
  return [
    "cz-piece", `cz-part-${part.id}`,
    part.design ? "cz-design" : "",
    part.overflow ? "cz-over" : "",
    part.contain ? "cz-contain" : "",
    phoneHide ? "cz-phone-hide" : "",
    p.w <= 6 ? "cz-small" : "",
    p.style?.bg || p.style?.glass ? "cz-ownbg" : "",
  ].filter(Boolean).join(" ");
}
export const designScope = (part: PartDef) => (part.design ? `ui-${part.design}${GLASS_DESIGNS.includes(part.design) ? " ui-glass" : ""}` : "");

export function CustomCanvas({ design, render, className = "", children, extraClass }: {
  design: Pick<BuiltDesign, "canvas" | "pieces">;
  render: (p: DesignPiece, part: PartDef) => ReactNode;
  className?: string;
  /** extra classes for a piece right now (e.g. a pop-up window that's open) */
  extraClass?: (p: DesignPiece) => string;
  /** drawn after the pieces (pop-up windows and such) */
  children?: ReactNode;
}) {
  useDesignFonts(design);
  const rows = canvasRows(design);
  // phones read the pieces top to bottom, left to right
  const order = new Map([...design.pieces].sort((a, b) => a.y - b.y || a.x - b.x).map((p, i) => [p.id, i]));
  return (
    <div className={`cz-layout ${className}`} data-tone={design.canvas.tone} style={canvasStyle(design.canvas)}>
      <div className="cz-canvas" style={{ height: rows * ROW }}>
        {design.pieces.map((p) => {
          const part = PART_BY_ID.get(p.part);
          if (!part || p.hidden) return null;
          const body = render(p, part);
          if (body === null) return null;
          return (
            <div key={p.id} className={`${pieceClass(p, part)} ${extraClass?.(p) || ""}`} data-piece={p.id} style={pieceBoxStyle(p, order.get(p.id))}>
              <div className={`cz-in ${designScope(part)}`} style={pieceInnerStyle(p)}>{body}</div>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
