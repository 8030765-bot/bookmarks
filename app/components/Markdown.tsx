"use client";
import { Fragment, ReactNode } from "react";

/**
 * A small, safe formatter for guides, bios and wiki pages. It builds React
 * elements (never raw HTML), and only http(s) links and links to pages on
 * this site (/wiki/…) become clickable.
 * Supports: # headings, **bold**, *italic*, `code`, [links](https://… or /path),
 * bare https:// links, - bullet and 1. numbered lists, > quotes, --- lines.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/(?![\/\\]))[^\s)]*\)|https?:\/\/[^\s<>()]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^\s)]*)\)$/.exec(t)!;
      // links to this site stay in the same tab
      if (mm[2].startsWith("/")) out.push(<a key={k} href={mm[2]}>{mm[1]}</a>);
      else out.push(<a key={k} href={mm[2]} target="_blank" rel="noopener noreferrer">{mm[1]}</a>);
    } else if (t.startsWith("http")) out.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer">{t}</a>);
    else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2], key);
      blocks.push(level === 1 ? <h3 key={key}>{content}</h3> : level === 2 ? <h4 key={key}>{content}</h4> : <h5 key={key}>{content}</h5>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { blocks.push(<hr key={key} />); i++; continue; }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(<li key={i}>{inline(lines[i].replace(/^\s*[-*•]\s+/, ""), `l${i}`)}</li>); i++; }
      blocks.push(<ul key={key}>{items}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(<li key={i}>{inline(lines[i].replace(/^\s*\d+[.)]\s+/, ""), `l${i}`)}</li>); i++; }
      blocks.push(<ol key={key}>{items}</ol>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push(<blockquote key={key}>{inline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    // paragraph: consecutive plain lines, keeping single line breaks
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*•]\s|\s*\d+[.)]\s|>|-{3,}$)/.test(lines[i])) { para.push(lines[i]); i++; }
    if (!para.length) { para.push(line); i++; } // never get stuck on a line nothing else claimed
    blocks.push(<p key={key}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `${key}-${j}`)}</Fragment>)}</p>);
  }
  return <div className={`md ${className}`}>{blocks}</div>;
}
