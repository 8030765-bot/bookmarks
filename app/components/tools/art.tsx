"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCopy, useToolState } from "./shared";

/* ---------- colour helpers ---------- */
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
export function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
const textOn = (hex: string) => { const [r, g, b] = hexToRgb(hex); return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff"; };

/* ---------- colour picker ---------- */
export function ColorPicker() {
  const [hex, setHex] = useToolState("color", "hex", "#7c6cff");
  const [saved, setSaved] = useToolState<string[]>("color", "saved", []);
  const { copied, copy } = useCopy();
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const formats = [hex.toUpperCase(), `rgb(${r}, ${g}, ${b})`, `hsl(${h}, ${s}%, ${l}%)`];
  const pickFromScreen = async () => {
    try {
      const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      if (!ED) return;
      const res = await new ED().open();
      setHex(res.sRGBHex);
    } catch {}
  };
  return (
    <div>
      <div className="color-big" style={{ background: hex, color: textOn(hex) }}>{hex.toUpperCase()}</div>
      <div className="tool-row">
        <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="Pick a colour" className="color-in" />
        <input value={hex} onChange={(e) => { const v = e.target.value.trim(); if (/^#?[0-9a-f]{0,6}$/i.test(v)) setHex(v.startsWith("#") ? v : `#${v}`); }} className="mono" aria-label="Hex code" maxLength={7} />
        {"EyeDropper" in (typeof window !== "undefined" ? window : {}) && <button className="btn btn-secondary btn-sm" onClick={pickFromScreen}>Pick from screen</button>}
      </div>
      <label className="tool-label">Lightness</label>
      <input type="range" min={0} max={100} value={l} onChange={(e) => setHex(hslToHex(h, s, Number(e.target.value)))} />
      <ul className="tool-list">
        {formats.map((f) => <li key={f}><span className="mono">{f}</span><button className="link-btn" onClick={() => copy(f)}>{copied === f ? "copied" : "copy"}</button></li>)}
      </ul>
      <div className="swatches">
        <button className="btn btn-secondary btn-sm" onClick={() => setSaved([hex, ...saved.filter((x) => x !== hex)].slice(0, 16))}>Save colour</button>
        {saved.map((c) => <button key={c} className="swatch" style={{ background: c }} title={c} aria-label={c} onClick={() => setHex(c)} onContextMenu={(e) => { e.preventDefault(); setSaved(saved.filter((x) => x !== c)); }} />)}
      </div>
      {saved.length > 0 && <p className="tool-hint">Right-click a saved colour to remove it.</p>}
    </div>
  );
}

/* ---------- palette generator ---------- */
const SCHEMES: Record<string, (h: number, s: number, l: number) => [number, number, number][]> = {
  analogous: (h, s, l) => [-40, -20, 0, 20, 40].map((d) => [(h + d + 360) % 360, s, l]),
  complementary: (h, s, l) => [[h, s, l], [h, s, clamp(l + 20, 10, 90)], [(h + 180) % 360, s, l], [(h + 180) % 360, s, clamp(l - 20, 10, 90)], [h, clamp(s - 40, 5, 100), 92]],
  triadic: (h, s, l) => [[h, s, l], [(h + 120) % 360, s, l], [(h + 240) % 360, s, l], [h, s, clamp(l - 25, 8, 90)], [h, clamp(s - 50, 5, 100), 94]],
  shades: (h, s) => [90, 72, 55, 38, 20].map((l) => [h, s, l]),
  pastel: (h) => [0, 60, 120, 200, 280].map((d) => [(h + d) % 360, 70, 85]),
};
export function PaletteMaker() {
  const [base, setBase] = useToolState("palette", "base", "#3dd68c");
  const [scheme, setScheme] = useToolState("palette", "scheme", "analogous");
  const { copied, copy } = useCopy();
  const [h, s, l] = rgbToHsl(...hexToRgb(base));
  const colors = useMemo(() => (SCHEMES[scheme] || SCHEMES.analogous)(h, s, l).map(([a, b, c]) => hslToHex(a, b, c)), [h, s, l, scheme]);
  const css = colors.map((c, i) => `--color-${i + 1}: ${c};`).join("\n");
  return (
    <div>
      <div className="tool-row">
        <input type="color" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Base colour" className="color-in" />
        <select value={scheme} onChange={(e) => setScheme(e.target.value)} aria-label="Kind of palette">
          {Object.keys(SCHEMES).map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setBase(hslToHex(Math.floor(Math.random() * 360), 55 + Math.floor(Math.random() * 35), 45 + Math.floor(Math.random() * 20)))}>🎲 Random</button>
      </div>
      <div className="tool-palette">
        {colors.map((c, i) => (
          <button key={i} style={{ background: c, color: textOn(c) }} onClick={() => copy(c)} title="Copy">
            {copied === c ? "copied" : c.toUpperCase()}
          </button>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => copy(css)}>{copied === css ? "Copied!" : "Copy as CSS"}</button>
    </div>
  );
}

/* ---------- sketchpad ---------- */
export function Sketchpad() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useToolState("sketch", "color", "#ffffff");
  const [size, setSize] = useToolState("sketch", "size", 4);
  const [eraser, setEraser] = useState(false);
  const [bg] = useState("#111111");
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const undo = useRef<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // bring back the last drawing
  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    try {
      const saved = localStorage.getItem("tool:sketch:image");
      if (saved) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = saved; }
    } catch {}
  }, [bg]);
  const persist = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { try { localStorage.setItem("tool:sketch:image", canvas.current!.toDataURL("image/png")); } catch {} }, 400);
  };
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height };
  };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.strokeStyle = eraser ? bg : color;
    ctx.lineWidth = eraser ? size * 4 : size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  return (
    <div>
      <div className="tool-row">
        <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setEraser(false); }} aria-label="Pen colour" className="color-in" />
        <input type="range" min={1} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Pen size" />
        <button className={`pick ${eraser ? "on" : ""}`} onClick={() => setEraser(!eraser)}>Eraser</button>
      </div>
      <canvas
        ref={canvas}
        width={640}
        height={440}
        className="sketch"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          undo.current = [...undo.current, canvas.current!.toDataURL()].slice(-15);
          drawing.current = pos(e);
          line(drawing.current, drawing.current);
        }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pos(e); line(drawing.current, p); drawing.current = p; }}
        onPointerUp={() => { drawing.current = null; persist(); }}
        onPointerCancel={() => { drawing.current = null; }}
        aria-label="Drawing area"
      />
      <div className="tool-row">
        <button className="btn btn-secondary btn-sm" disabled={!undo.current.length} onClick={() => {
          const last = undo.current.pop();
          if (!last) return;
          const img = new Image();
          img.onload = () => { canvas.current!.getContext("2d")!.drawImage(img, 0, 0); persist(); };
          img.src = last;
        }}>Undo</button>
        <button className="btn btn-secondary btn-sm" onClick={() => {
          if (!confirm("Clear the drawing?")) return;
          undo.current.push(canvas.current!.toDataURL());
          const ctx = canvas.current!.getContext("2d")!;
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, canvas.current!.width, canvas.current!.height);
          persist();
        }}>Clear</button>
        <a className="btn btn-secondary btn-sm" download="sketch.png" href="#" onClick={(e) => { (e.currentTarget as HTMLAnchorElement).href = canvas.current!.toDataURL("image/png"); }}>Save as picture</a>
      </div>
    </div>
  );
}

/* ---------- pixel art ---------- */
const PIXEL_COLORS = ["#000000", "#ffffff", "#ff5c7a", "#ffb84d", "#ffe066", "#3dd68c", "#4dabff", "#7c6cff", "#e879f9", "#8b5a2b", "#a3a3a3", "transparent"];
export function PixelArt() {
  const [size, setSize] = useToolState("pixel", "size", 16);
  const [grid, setGrid] = useToolState<string[]>("pixel", "grid", Array(16 * 16).fill("transparent"));
  const [color, setColor] = useToolState("pixel", "color", "#7c6cff");
  const [fill, setFill] = useState(false);
  const down = useRef(false);
  const cells = grid.length === size * size ? grid : Array(size * size).fill("transparent");
  const paint = (i: number) => {
    if (fill) {
      const target = cells[i];
      if (target === color) return;
      const next = [...cells];
      const stack = [i];
      while (stack.length) {
        const j = stack.pop()!;
        if (next[j] !== target) continue;
        next[j] = color;
        const x = j % size, y = Math.floor(j / size);
        if (x > 0) stack.push(j - 1);
        if (x < size - 1) stack.push(j + 1);
        if (y > 0) stack.push(j - size);
        if (y < size - 1) stack.push(j + size);
      }
      setGrid(next);
      return;
    }
    if (cells[i] === color) return;
    const next = [...cells];
    next[i] = color;
    setGrid(next);
  };
  const exportPng = () => {
    const scale = Math.max(1, Math.floor(512 / size));
    const c = document.createElement("canvas");
    c.width = c.height = size * scale;
    const ctx = c.getContext("2d")!;
    cells.forEach((col, i) => { if (col !== "transparent") { ctx.fillStyle = col; ctx.fillRect((i % size) * scale, Math.floor(i / size) * scale, scale, scale); } });
    const a = document.createElement("a");
    a.download = "pixel-art.png";
    a.href = c.toDataURL("image/png");
    a.click();
  };
  return (
    <div>
      <div className="pixel-colors">
        {PIXEL_COLORS.map((c) => (
          <button key={c} className={`swatch ${color === c ? "on" : ""} ${c === "transparent" ? "clear" : ""}`} style={{ background: c === "transparent" ? undefined : c }} aria-label={c === "transparent" ? "Eraser" : c} onClick={() => setColor(c)} />
        ))}
        <input type="color" value={color === "transparent" ? "#000000" : color} onChange={(e) => setColor(e.target.value)} aria-label="Any colour" className="color-in sm" />
      </div>
      <div
        className="pixel-grid"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        onPointerLeave={() => { down.current = false; }}
        onPointerUp={() => { down.current = false; }}
      >
        {cells.map((c, i) => (
          <span
            key={i}
            className="px"
            style={{ background: c === "transparent" ? undefined : c }}
            onPointerDown={(e) => { e.preventDefault(); down.current = true; paint(i); }}
            onPointerEnter={() => { if (down.current && !fill) paint(i); }}
          />
        ))}
      </div>
      <div className="tool-row">
        <button className={`pick ${fill ? "on" : ""}`} onClick={() => setFill(!fill)}>🪣 Fill</button>
        <select value={size} onChange={(e) => { const n = Number(e.target.value); if (confirm("Changing the size clears the picture. Go ahead?")) { setSize(n); setGrid(Array(n * n).fill("transparent")); } }} aria-label="Grid size">
          {[8, 16, 24, 32].map((n) => <option key={n} value={n}>{n}×{n}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => { if (confirm("Clear the picture?")) setGrid(Array(size * size).fill("transparent")); }}>Clear</button>
        <button className="btn btn-secondary btn-sm" onClick={exportPng}>Save as picture</button>
      </div>
    </div>
  );
}
