"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Folder } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import type { LinkRef } from "./ui";

type Suggestion =
  | { kind: "recent"; text: string }
  | { kind: "tag"; tag: string; count: number }
  | { kind: "folder"; folder: Folder }
  | { kind: "link"; ref: LinkRef }
  | { kind: "op"; text: string; help: string };

const OPERATORS: [string, string][] = [
  ["tag:", "only links with a tag"], ["in:", "only one folder"], ["site:", "only one website, e.g. site:youtube.com"],
  ["by:", "added by someone"], ["is:new", "new since your last visit"], ["is:later", "your Read later list"], ["is:fav", "your favorites"],
  ["rating:4+", "rated 4 stars or more"], ["added:7d", "added in the last week"], ["-", "leave a word out, e.g. -games"],
];
const RECENT_KEY = "recentSearches";

/** The search box: recent searches, suggestions as you type, and voice search. */
export default function SearchBox({
  value,
  onChange,
  inputRef,
  placeholder,
  refs,
  folders,
  tags,
  onEnter,
  onFocusResults,
  onPickLink,
  onPickFolder,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  placeholder: string;
  refs: LinkRef[];
  folders: Folder[];
  tags: [string, number][];
  /** Enter with no suggestion picked */
  onEnter: () => void;
  /** ArrowDown with nothing to pick: move into the results */
  onFocusResults: () => void;
  onPickLink: (ref: LinkRef) => void;
  onPickFolder: (folder: Folder) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const recognizer = useRef<any>(null);
  const boxRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch {}
    setCanVoice(typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);
  function remember(text: string) {
    const t = text.trim();
    if (t.length < 2) return;
    const next = [t, ...recent.filter((r) => r !== t)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  }
  function forget(text: string) {
    const next = recent.filter((r) => r !== text);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  }

  const q = value.trim().toLowerCase();
  const lastWord = q.split(/\s+/).pop() || "";
  const items: Suggestion[] = useMemo(() => {
    if (!q) return recent.map((text) => ({ kind: "recent" as const, text }));
    const out: Suggestion[] = [];
    if (lastWord.startsWith("tag:") || lastWord === "#") {
      const t = lastWord.replace(/^tag:|^#/, "");
      tags.filter(([name]) => name.startsWith(t)).slice(0, 6).forEach(([tag, count]) => out.push({ kind: "tag", tag, count }));
      return out;
    }
    if (/^[a-z]{1,6}$/.test(lastWord)) {
      OPERATORS.filter(([op]) => op.startsWith(lastWord) && op !== lastWord).slice(0, 2).forEach(([text, help]) => out.push({ kind: "op", text, help }));
    }
    tags.filter(([name]) => name.includes(q)).slice(0, 3).forEach(([tag, count]) => out.push({ kind: "tag", tag, count }));
    folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 3).forEach((folder) => out.push({ kind: "folder", folder }));
    refs.filter((r) => r.link.name.toLowerCase().includes(q)).slice(0, 5).forEach((ref) => out.push({ kind: "link", ref }));
    return out;
  }, [q, lastWord, recent, tags, folders, refs]);

  useEffect(() => { setActive(-1); }, [q]);
  // close when clicking anywhere else
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  function replaceLastWord(text: string) {
    const parts = value.replace(/\s+$/, "").split(/\s+/);
    parts[parts.length - 1] = text;
    onChange(parts.join(" ") + (text.endsWith(":") ? "" : " "));
    inputRef.current?.focus();
  }
  function pick(s: Suggestion) {
    if (s.kind === "recent") { onChange(s.text); return; }
    if (s.kind === "op") { replaceLastWord(s.text); return; }
    if (s.kind === "tag") {
      if (lastWord.startsWith("tag:") || lastWord === "#") replaceLastWord(`tag:${s.tag}`);
      else onChange(`tag:${s.tag} `);
      return;
    }
    setOpen(false);
    remember(value);
    if (s.kind === "folder") onPickFolder(s.folder);
    else onPickLink(s.ref);
  }

  function voice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recognizer.current?.stop(); return; }
    const r = new SR();
    recognizer.current = r;
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => onChange(Array.from(e.results).map((x: any) => x[0].transcript).join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  }

  const showList = open && items.length > 0;
  return (
    <label className="top-search" ref={boxRef}>
      <Icon name="search" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (showList && active < items.length - 1) setActive(active + 1);
            else { setOpen(false); onFocusResults(); }
          } else if (e.key === "ArrowUp" && showList) {
            e.preventDefault();
            setActive(Math.max(-1, active - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (showList && active >= 0) pick(items[active]);
            else { remember(value); setOpen(false); onEnter(); }
          } else if (e.key === "Escape" && open) {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label="Search websites"
        aria-expanded={showList}
        aria-autocomplete="list"
        role="combobox"
      />
      {canVoice && (
        <button type="button" className={`clear voice ${listening ? "on" : ""}`} onClick={voice} title={listening ? "Stop listening" : "Search by voice"} aria-label="Search by voice">
          <Icon name="mic" />
        </button>
      )}
      {value ? (
        <button type="button" className="clear" onClick={() => { onChange(""); inputRef.current?.focus(); }} aria-label="Clear search"><Icon name="x" /></button>
      ) : (
        <span className="kbd">/</span>
      )}
      {showList && (
        <div className="search-suggest" role="listbox">
          {!q && <div className="ss-head">Recent searches</div>}
          {items.map((s, i) => (
            <div
              key={i}
              role="option"
              aria-selected={active === i}
              className={`ss-item ${active === i ? "on" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
            >
              {s.kind === "recent" && (<><Icon name="clock" /> <span className="ss-main">{s.text}</span>
                <button className="ss-x" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); forget(s.text); }} aria-label="Forget">×</button></>)}
              {s.kind === "op" && (<><Icon name="search" /> <span className="ss-main"><code>{s.text}</code></span><span className="ss-hint">{s.help}</span></>)}
              {s.kind === "tag" && (<><Icon name="tag" /> <span className="ss-main">#{s.tag}</span><span className="ss-hint">{s.count}</span></>)}
              {s.kind === "folder" && (<><span className="ss-emoji">{s.folder.emoji}</span> <span className="ss-main">{s.folder.name}</span><span className="ss-hint">folder</span></>)}
              {s.kind === "link" && (<><Favicon url={s.ref.link.url} name={s.ref.link.name} size={16} /> <span className="ss-main">{s.ref.link.name}</span><span className="ss-hint">{s.ref.folder.emoji} {s.ref.folder.name}</span></>)}
            </div>
          ))}
        </div>
      )}
    </label>
  );
}
