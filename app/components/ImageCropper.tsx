"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Picture tools that run in the browser, so only small files are uploaded:
 * a crop + zoom box (profile pictures, banners, link icons) and a plain
 * "shrink to fit" for chat pictures.
 */
const GIF_MAX = 450_000;

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't open that picture"));
    img.src = src;
  });
}
function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file"));
    r.readAsDataURL(file);
  });
}
/** WebP where the browser can make it, else JPEG (keeps files small either way). */
function encode(canvas: HTMLCanvasElement, quality = 0.85, keepAlpha = false) {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
}
/** Approximate size of a data: URL's file, in bytes. */
export const dataUrlBytes = (u: string) => Math.round(((u.length - u.indexOf(",") - 1) * 3) / 4);

/** Shrink a picture so its longest side is at most `max` pixels. */
export async function shrinkImage(file: File, max = 1280, quality = 0.82): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error("Pick a PNG, JPEG, WebP or GIF picture");
  // small GIFs keep moving; big ones become a still picture
  if (file.type === "image/gif" && file.size <= GIF_MAX) return readDataUrl(file);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    let out = encode(c, quality, file.type === "image/png");
    if (dataUrlBytes(out) > 380_000) out = encode(c, 0.6);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface CropResult {
  data: string;
  /** a still frame, when `data` is a moving GIF */
  still?: string;
}

/**
 * Pick a file, then drag to move and use the slider (or mouse wheel) to
 * zoom. Arrow keys move it too, + and − zoom.
 */
export function ImageCropper({ aspect = 1, outW = 192, round = true, allowGif = false, title = "Choose a picture", onDone, onCancel }: {
  aspect?: number;
  outW?: number;
  round?: boolean;
  allowGif?: boolean;
  title?: string;
  onDone: (r: CropResult) => Promise<void> | void;
  onCancel: () => void;
}) {
  const VW = 280;
  const VH = Math.round(VW / aspect);
  const outH = Math.round(outW / aspect);
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [gif, setGif] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => { fileRef.current?.click(); }, []);

  const base = img ? Math.max(VW / img.naturalWidth, VH / img.naturalHeight) : 1;
  const s = base * zoom;
  const clamp = (o: { x: number; y: number }, sc = s) => img ? {
    x: Math.min(0, Math.max(VW - img.naturalWidth * sc, o.x)),
    y: Math.min(0, Math.max(VH - img.naturalHeight * sc, o.y)),
  } : o;

  async function pick(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { setError("Pick a PNG, JPEG, WebP or GIF picture"); return; }
    if (file.size > 15_000_000) { setError("That file is very big — pick one under 15 MB"); return; }
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImg(url);
      setSrc(url);
      setImg(im);
      setGif(allowGif && file.type === "image/gif" ? file : null);
      setZoom(1);
      const b = Math.max(VW / im.naturalWidth, VH / im.naturalHeight);
      setOff({ x: (VW - im.naturalWidth * b) / 2, y: (VH - im.naturalHeight * b) / 2 });
    } catch (e: any) {
      setError(e.message);
    }
  }

  function setZoomKeepCentre(z: number) {
    const nz = Math.min(5, Math.max(1, z));
    const ns = base * nz;
    // keep the middle of the box where it is
    const cx = (VW / 2 - off.x) / s;
    const cy = (VH / 2 - off.y) / s;
    setZoom(nz);
    setOff(clamp({ x: VW / 2 - cx * ns, y: VH / 2 - cy * ns }, ns));
  }

  function render(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img!, -off.x / s, -off.y / s, VW / s, VH / s, 0, 0, w, h);
    return c;
  }

  async function done() {
    if (!img) return;
    setBusy(true);
    setError("");
    try {
      if (gif && gif.size <= GIF_MAX) {
        // GIFs are used as they are (the crop only picks the still frame)
        await onDone({ data: await readDataUrl(gif), still: encode(render(outW, outH)) });
      } else {
        await onDone({ data: encode(render(outW, outH), 0.85) });
      }
    } catch (e: any) {
      setError(e.message || "Couldn't save that picture");
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); setOff((o) => clamp({ x: o.x + moves[e.key][0], y: o.y + moves[e.key][1] })); }
    if (e.key === "+" || e.key === "=") setZoomKeepCentre(zoom + 0.1);
    if (e.key === "-") setZoomKeepCentre(zoom - 0.1);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (!busy) onCancel(); }}>
      <div className="modal cropper" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        {!img ? (
          <button
            className="crop-drop"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          >
            <span className="empty-emoji">🖼️</span>
            Choose a picture, or drop one here
          </button>
        ) : (
          <>
            <div
              className={`crop-box ${round ? "round" : ""}`}
              style={{ width: VW, height: VH }}
              tabIndex={0}
              role="application"
              aria-label="Picture position: drag or use the arrow keys to move, + and − to zoom"
              onKeyDown={onKey}
              onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
              onPointerMove={(e) => { const d = drag.current; if (d) setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }}
              onPointerUp={() => { drag.current = null; }}
              onWheel={(e) => setZoomKeepCentre(zoom - e.deltaY / 500)}
            >
              <img src={src!} alt="" draggable={false} style={{ width: img.naturalWidth * s, height: img.naturalHeight * s, transform: `translate(${off.x}px, ${off.y}px)` }} />
              <span className="crop-mask" aria-hidden="true" />
            </div>
            <label className="crop-zoom">
              <span>Zoom</span>
              <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoomKeepCentre(Number(e.target.value))} />
            </label>
            {gif && (gif.size <= GIF_MAX
              ? <p className="hint">Moving pictures are used whole — this box just picks the still frame people see before they hover.</p>
              : <p className="hint">That GIF is over {Math.round(GIF_MAX / 1000)} KB, so it&apos;ll be a still picture.</p>)}
          </>
        )}
        {error && <div className="field-warn">{error}</div>}
        <div className="modal-actions">
          {img && <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Another picture</button>}
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={done} disabled={!img || busy}>{busy ? "Uploading…" : "Use this"}</button>
        </div>
      </div>
    </div>
  );
}
