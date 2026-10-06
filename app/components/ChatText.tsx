"use client";
import { Fragment, ReactNode, useState } from "react";
import Favicon from "./Favicon";
import { hostOf, safeHref } from "./ui";

/**
 * Chat message formatting, built as React elements (never raw HTML):
 * **bold**  *italic*  ~~strike~~  `code`  ```code block```  ||spoiler||
 * $x^2$ maths, @mentions, links (shown as bookmark cards when the link
 * is already on the site), and "> quote" lines.
 */
export interface KnownLink { name: string; url: string; folder: string; emoji: string }

const KEYWORDS = /\b(function|const|let|var|return|if|else|for|while|class|import|from|export|def|print|true|false|null|None|True|False|new|async|await)\b/g;

function CodeBlock({ code }: { code: string }) {
  // tiny highlighter: strings, comments, numbers, keywords
  const parts = code.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/[^\n]*|#[^\n]*|\b\d+(?:\.\d+)?\b)/g);
  return (
    <pre className="chat-code"><code>
      {parts.map((p, i) => {
        if (/^["']/.test(p)) return <span key={i} className="tok-str">{p}</span>;
        if (/^(\/\/|#)/.test(p)) return <span key={i} className="tok-com">{p}</span>;
        if (/^\d/.test(p)) return <span key={i} className="tok-num">{p}</span>;
        const bits = p.split(KEYWORDS);
        return <Fragment key={i}>{bits.map((b, j) => (j % 2 ? <span key={j} className="tok-kw">{b}</span> : b))}</Fragment>;
      })}
    </code></pre>
  );
}

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return <span className={`spoiler ${shown ? "shown" : ""}`} onClick={(e) => { e.stopPropagation(); setShown(true); }} title={shown ? "" : "Click to reveal"}>{children}</span>;
}

/** $x^2 + y_1$ → superscripts and subscripts, sqrt(…) → √(…). */
function Maths({ src }: { src: string }) {
  const out: ReactNode[] = [];
  const re = /([\^_])(\{[^}]*\}|\S)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = src.replace(/sqrt/g, "√").replace(/\*/g, "×").replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠").replace(/\bpi\b/g, "π");
  while ((m = re.exec(text))) {
    out.push(text.slice(last, m.index));
    const v = m[2].replace(/^\{|\}$/g, "");
    out.push(m[1] === "^" ? <sup key={m.index}>{v}</sup> : <sub key={m.index}>{v}</sub>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <span className="chat-math">{out}</span>;
}

function inline(text: string, ctx: { me: string | null; known: (url: string) => KnownLink | undefined; previews: boolean; cards: KnownLink[] }, key = "i"): ReactNode[] {
  const re = /(\|\|[^|]+\|\||\$[^$\n]+\$|`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\s][^*]*\*|_[^_\s][^_]*_|@[A-Za-z0-9_]{3,20}|https?:\/\/[^\s<>()]+)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}${i++}`;
    if (t.startsWith("||")) out.push(<Spoiler key={k}>{inline(t.slice(2, -2), ctx, k)}</Spoiler>);
    else if (t.startsWith("$")) out.push(<Maths key={k} src={t.slice(1, -1)} />);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), ctx, k)}</strong>);
    else if (t.startsWith("~~")) out.push(<del key={k}>{inline(t.slice(2, -2), ctx, k)}</del>);
    else if (t.startsWith("@")) {
      const self = ctx.me && t.slice(1).toLowerCase() === ctx.me.toLowerCase();
      out.push(<span key={k} className={`mention ${self ? "self" : ""}`}>{t}</span>);
    } else if (/^https?:\/\//.test(t)) {
      const url = t.replace(/[.,;!?]+$/, "");
      const known = ctx.known(url);
      if (known) ctx.cards.push(known);
      out.push(<a key={k} href={safeHref(url)} target="_blank" rel="noopener noreferrer">{known ? known.name : url}</a>);
      if (url !== t) out.push(t.slice(url.length));
    } else out.push(<em key={k}>{inline(t.slice(1, -1), ctx, k)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LONG = 320;
const MAX_LINES = 8;

export default function ChatText({ text, me, known, previews = true }: {
  text: string;
  me: string | null;
  /** looks a URL up in the site's bookmarks */
  known: (url: string) => KnownLink | undefined;
  /** show link cards under the message */
  previews?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = text.split("\n").length;
  // long messages fold up (by length, or by lines for lists and poems)
  const long = (text.length > LONG || lineCount > MAX_LINES) && !text.includes("```");
  const body = !long || expanded ? text
    : lineCount > MAX_LINES ? `${text.split("\n").slice(0, MAX_LINES).join("\n").slice(0, LONG).trimEnd()}…`
    : `${text.slice(0, LONG).trimEnd()}…`;
  const cards: KnownLink[] = [];
  const ctx = { me, known, previews, cards };
  const blocks: ReactNode[] = [];
  // ```code blocks``` first, then quote lines, then normal text
  body.split(/(```[\s\S]*?```)/g).forEach((chunk, ci) => {
    if (chunk.startsWith("```") && chunk.endsWith("```") && chunk.length > 6) {
      blocks.push(<CodeBlock key={`c${ci}`} code={chunk.slice(3, -3).replace(/^[a-z]*\n/, "")} />);
      return;
    }
    const lines = chunk.split("\n");
    lines.forEach((line, li) => {
      const key = `l${ci}-${li}`;
      if (/^>\s?/.test(line)) blocks.push(<span key={key} className="chat-quote-line">{inline(line.replace(/^>\s?/, ""), ctx, key)}</span>);
      else blocks.push(<Fragment key={key}>{inline(line, ctx, key)}{li < lines.length - 1 ? "\n" : ""}</Fragment>);
    });
  });
  // links in the message that aren't bookmarks get a small preview line
  const others = previews ? Array.from(new Set((body.match(/https?:\/\/[^\s<>()]+/g) || []).map((u) => u.replace(/[.,;!?]+$/, "")))).filter((u) => !known(u)).slice(0, 2) : [];
  return (
    <>
      {blocks}
      {long && <button className="link-btn chat-more" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>{expanded ? "Show less" : "Show more"}</button>}
      {previews && cards.slice(0, 2).map((c) => (
        <a key={c.url} className="chat-card" href={safeHref(c.url)} target="_blank" rel="noopener noreferrer">
          <Favicon url={c.url} name={c.name} size={20} />
          <span><strong>{c.name}</strong><em>{c.emoji} {c.folder} · on the site</em></span>
        </a>
      ))}
      {others.map((u) => (
        <a key={u} className="chat-card plain" href={safeHref(u)} target="_blank" rel="noopener noreferrer">
          <Favicon url={u} name={hostOf(u)} size={16} />
          <span><em>{hostOf(u)}</em></span>
        </a>
      ))}
    </>
  );
}

/* ---------- :shortcodes: ---------- */
export const SHORTCODES: Record<string, string> = {
  smile: "😄", joy: "😂", heart: "❤️", fire: "🔥", thumbsup: "👍", "+1": "👍", thumbsdown: "👎", clap: "👏", party: "🥳", tada: "🎉",
  eyes: "👀", skull: "💀", cry: "😢", sob: "😭", thinking: "🤔", wave: "👋", ok: "👌", pray: "🙏", star: "⭐", sparkles: "✨",
  rocket: "🚀", 100: "💯", check: "✅", x: "❌", warning: "⚠️", book: "📚", pencil: "✏️", game: "🎮", music: "🎵", pizza: "🍕",
  cool: "😎", wink: "😉", sweat: "😅", shrug: "🤷", facepalm: "🤦", rofl: "🤣", angry: "😠", sleepy: "😴", brain: "🧠", trophy: "🏆",
};
export function applyShortcodes(text: string, extra: Record<string, string> = {}) {
  const all = { ...SHORTCODES, ...extra };
  return text.replace(/:([a-z0-9_+-]{1,20}):/gi, (m, name: string) => all[name.toLowerCase()] ?? m);
}
