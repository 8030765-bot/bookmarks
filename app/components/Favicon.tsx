"use client";
import { useState } from "react";
import { hostOf, readLocal, writeLocal } from "./ui";

// Icons come through our own /api/icon (cached by the CDN and offline).
// Unknown sites get a 404 there, so we show a coloured letter instead.
export const iconUrl = (host: string) => `/api/icon?d=${encodeURIComponent(host)}`;

function hue(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

/* ---------- a site's main colour, read from its icon ---------- */
let colorCache: Record<string, string> | null = null;
const pending = new Map<string, Promise<string>>();
/** The most colourful average shade in a site's icon, e.g. "hsl(210 70% 55%)". "" if it's grey. */
export function iconColor(host: string): Promise<string> {
  if (!host) return Promise.resolve("");
  colorCache ||= readLocal<Record<string, string>>("iconColors", {});
  if (host in colorCache) return Promise.resolve(colorCache[host]);
  if (pending.has(host)) return pending.get(host)!;
  const p = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, 16, 16);
        const px = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
          const [pr, pg, pb, pa] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
          const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
          if (pa < 128 || max - min < 40) continue; // skip see-through and grey pixels
          r += pr; g += pg; b += pb; n++;
        }
        let out = "";
        if (n >= 6) {
          r /= n * 255; g /= n * 255; b /= n * 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
          let h = 0;
          if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
          out = `hsl(${Math.round((h * 60 + 360) % 360)} 70% 58%)`;
        }
        resolve(out);
      } catch {
        resolve("");
      }
    };
    img.onerror = () => resolve("");
    img.src = iconUrl(host);
  }).then((color) => {
    colorCache![host] = color;
    writeLocal("iconColors", colorCache);
    pending.delete(host);
    return color;
  });
  pending.set(host, p);
  return p;
}

export default function Favicon({ url, name, size = 22, className = "" }: { url: string; name: string; size?: number; className?: string }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(!host || !host.includes("."));

  if (failed) {
    const h = hue(host || name);
    return (
      <span
        className={`fav-letter ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.55, background: `hsl(${h} 55% 22%)`, color: `hsl(${h} 80% 78%)` }}
        aria-hidden="true"
      >
        {(name || host || "?").trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // a plain <img>: next/image would route every icon through paid image optimisation
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={iconUrl(host)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onLoad={(e) => {
        // some sites only have a blurry 16px icon — a letter looks better than that
        if ((e.target as HTMLImageElement).naturalWidth <= 16) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}
