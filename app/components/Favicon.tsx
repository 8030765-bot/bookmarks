"use client";
import { useState } from "react";
import { hostOf } from "./ui";

// Google returns a 16px grey globe (with a 404) for sites it doesn't know.
// When that happens, show a coloured letter instead. (Other icon services
// were tried, but they return blank images we can't detect cross-origin.)
const iconUrl = (host: string) => `https://www.google.com/s2/favicons?domain=${host}&sz=64`;

function hue(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

export default function Favicon({ url, name, size = 22, className = "" }: { url: string; name: string; size?: number; className?: string }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(!host);

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
        // Google's "unknown site" globe is 16px even though we ask for 64
        if ((e.target as HTMLImageElement).naturalWidth <= 16) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}
