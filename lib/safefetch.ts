import { lookup } from "dns/promises";
import net from "net";

/**
 * Fetching a web page on the server on someone's behalf is risky: a link
 * could point at the server's own private network. These helpers only
 * allow public internet addresses, follow redirects by hand (checking each
 * hop), time out quickly and read at most a few hundred KB.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only web links can be checked");
  if (u.username || u.password) throw new Error("Links with logins in them can't be checked");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("That address isn't on the public internet");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host) || !host.includes(".") && !net.isIP(host)) {
    throw new Error("That address isn't on the public internet");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("That website couldn't be found");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address isn't on the public internet");
  return u;
}

export interface FetchedPage {
  status: number;
  url: string;
  contentType: string;
  text: string;
}

export async function safeFetchText(raw: string, { maxBytes = 512_000, timeoutMs = 6000 } = {}): Promise<FetchedPage> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TheosBookmarks/1.0; link preview)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    const contentType = res.headers.get("content-type") || "";
    let text = "";
    if (res.body && /html|xml|text/i.test(contentType)) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let read = 0;
      while (read < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.byteLength;
        text += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    } else {
      res.body?.cancel().catch(() => {});
    }
    return { status: res.status, url: url.toString(), contentType, text };
  }
  throw new Error("Too many redirects");
}

/* ---------- reading a page's title / description ---------- */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const k = key.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
    const a = new RegExp(`<meta[^>]+(?:name|property|itemprop)\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i").exec(html);
    if (a?.[1]) return a[1];
    const b = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property|itemprop)\\s*=\\s*["']${k}["']`, "i").exec(html);
    if (b?.[1]) return b[1];
  }
  return "";
}

export interface PageInfo {
  title: string;
  description: string;
  siteName: string;
  image: string;
  words: number;
  readMins: number;
}

export function readPageInfo(html: string, pageUrl: string): PageInfo {
  const clean = (s: string, max: number) => decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, max);
  const title = clean(metaContent(html, ["og:title", "twitter:title"]) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "", 120);
  const description = clean(metaContent(html, ["og:description", "description", "twitter:description"]), 300);
  const siteName = clean(metaContent(html, ["og:site_name", "application-name"]), 60);
  let image = metaContent(html, ["og:image", "og:image:url", "twitter:image"]);
  try {
    image = image ? new URL(decodeEntities(image), pageUrl).toString() : "";
    if (!/^https:\/\//.test(image)) image = "";
  } catch {
    image = "";
  }
  const body = (/<body[\s\S]*$/i.exec(html)?.[0] || html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const words = (decodeEntities(body).match(/[\p{L}\p{N}']{2,}/gu) || []).length;
  return { title, description, siteName, image, words, readMins: words ? Math.max(1, Math.round(words / 220)) : 0 };
}
