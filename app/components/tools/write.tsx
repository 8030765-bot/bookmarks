"use client";
import { useMemo, useState } from "react";
import { SHORTCODES } from "../ChatText";
import Markdown from "../Markdown";
import { todaysFact, todaysQuote, todaysWord } from "./daily-lists";
import { uid, useCopy, useSynced, useToolState } from "./shared";

/* ---------- private notes ---------- */
interface Note { id: string; title: string; body: string; at: string }
export function Notes() {
  const { value, set, ready, error, signedIn } = useSynced<Note[]>("notes", []);
  const [openId, setOpenId] = useToolState<string | null>("notes", "open", null);
  const [preview, setPreview] = useState(false);
  const note = value.find((n) => n.id === openId);
  const update = (patch: Partial<Note>) => set(value.map((n) => (n.id === openId ? { ...n, ...patch, at: new Date().toISOString() } : n)));
  if (!ready) return <div className="skeleton skel-line" />;
  if (note) {
    return (
      <div className="tool-notes">
        <div className="tool-row">
          <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(null)}>← All notes</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPreview(!preview)}>{preview ? "Edit" : "Preview"}</button>
          <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Delete this note?")) { set(value.filter((n) => n.id !== note.id)); setOpenId(null); } }}>Delete</button>
        </div>
        <input value={note.title} onChange={(e) => update({ title: e.target.value.slice(0, 80) })} placeholder="Title" className="note-title" />
        {preview ? <Markdown text={note.body || "*Empty*"} className="note-preview" /> : (
          <textarea value={note.body} onChange={(e) => update({ body: e.target.value.slice(0, 5000) })} rows={12} placeholder="Write anything — **bold**, - lists, links…" autoFocus />
        )}
        <p className="tool-hint">{signedIn ? "Saved to your account — only you can see it." : "Saved on this device. Log in to keep notes on every device."} {error && <span className="tool-error">{error}</span>}</p>
      </div>
    );
  }
  return (
    <div>
      <button className="btn btn-primary btn-sm" onClick={() => {
        const n = { id: uid(), title: "", body: "", at: new Date().toISOString() };
        set([n, ...value].slice(0, 50));
        setOpenId(n.id);
      }}>+ New note</button>
      {value.length === 0 && <p className="tool-hint">Your private scratchpad. Only you can see your notes.</p>}
      <ul className="tool-list notes-list">
        {[...value].sort((a, b) => b.at.localeCompare(a.at)).map((n) => (
          <li key={n.id}>
            <button className="note-open" onClick={() => setOpenId(n.id)}>
              <strong>{n.title || n.body.split("\n")[0].slice(0, 40) || "Untitled"}</strong>
              <span className="muted-inline">{new Date(n.at).toLocaleDateString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- to-do list ---------- */
interface Todo { id: string; text: string; done: boolean; due?: string }
export function Todos() {
  const { value, set, ready, error } = useSynced<Todo[]>("todos", []);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [hideDone, setHideDone] = useToolState("todos", "hideDone", false);
  const today = new Date().toISOString().slice(0, 10);
  const list = value.filter((t) => !hideDone || !t.done);
  const left = value.filter((t) => !t.done).length;
  return (
    <div>
      <form className="tool-row" onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        set([...value, { id: uid(), text: text.trim().slice(0, 200), done: false, due: due || undefined }].slice(0, 200));
        setText(""); setDue("");
      }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…" maxLength={200} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="date-in" />
        <button className="btn btn-primary btn-sm" disabled={!text.trim()}>Add</button>
      </form>
      {!ready && <div className="skeleton skel-line" />}
      <ul className="tool-list todos">
        {list.map((t) => (
          <li key={t.id} className={t.done ? "done" : t.due && t.due < today ? "late" : ""}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => set(value.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
              <span>{t.text}</span>
            </label>
            {t.due && <span className="muted-inline">{t.due === today ? "today" : new Date(`${t.due}T12:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
            <button className="btn-icon sm" aria-label={`Delete ${t.text}`} onClick={() => set(value.filter((x) => x.id !== t.id))}>×</button>
          </li>
        ))}
      </ul>
      {value.length > 0 && (
        <div className="tool-row small">
          <span className="muted-inline">{left} left</span>
          <label className="check-row"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done</label>
          {value.some((t) => t.done) && <button className="link-btn" onClick={() => set(value.filter((t) => !t.done))}>Clear done</button>}
        </div>
      )}
      {error && <p className="tool-error">{error}</p>}
    </div>
  );
}

/* ---------- word & character counter ---------- */
export function WordCounter() {
  const [text, setText] = useToolState("wordcount", "text", "");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || []).length || (text.trim() ? 1 : 0);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of text.toLowerCase().match(/[a-z']{4,}/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
    return Array.from(counts.entries()).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [text]);
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 50000))} rows={8} placeholder="Paste or type your text…" />
      <div className="stat-grid">
        <div><strong>{words}</strong><span>words</span></div>
        <div><strong>{text.length}</strong><span>characters</span></div>
        <div><strong>{text.replace(/\s/g, "").length}</strong><span>no spaces</span></div>
        <div><strong>{sentences}</strong><span>sentences</span></div>
        <div><strong>{paragraphs}</strong><span>paragraphs</span></div>
        <div><strong>{Math.max(1, Math.round(words / 200))}</strong><span>min read</span></div>
      </div>
      {top.length > 0 && <p className="tool-hint">Used a lot: {top.map(([w, n]) => `${w} (${n})`).join(", ")}</p>}
    </div>
  );
}

/* ---------- text case converter ---------- */
const CASES: [string, (s: string) => string][] = [
  ["UPPER", (s) => s.toUpperCase()],
  ["lower", (s) => s.toLowerCase()],
  ["Title Case", (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())],
  ["Sentence case", (s) => s.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase())],
  ["aLtErNaTe", (s) => Array.from(s).map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join("")],
  ["camelCase", (s) => s.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())],
  ["snake_case", (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")],
  ["kebab-case", (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")],
  ["Reversed", (s) => Array.from(s).reverse().join("")],
];
export function CaseConverter() {
  const [text, setText] = useToolState("case", "text", "");
  const { copied, copy } = useCopy();
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 20000))} rows={4} placeholder="Type or paste text…" />
      <div className="chip-grid">
        {CASES.map(([name, fn]) => (
          <button key={name} className="pick" disabled={!text} onClick={() => setText(fn(text))}>{name}</button>
        ))}
      </div>
      <div className="tool-row"><button className="btn btn-secondary btn-sm" disabled={!text} onClick={() => copy(text)}>{copied === text && text ? "Copied!" : "Copy"}</button></div>
    </div>
  );
}

/* ---------- dictionary ---------- */
interface Entry { word: string; phonetic?: string; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] }
export function Dictionary() {
  const [q, setQ] = useToolState("dictionary", "q", "");
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const look = async (word = q) => {
    if (!word.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/tools?define=${encodeURIComponent(word.trim())}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't look that up");
      setEntry(j.entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't look that up");
      setEntry(undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <form className="tool-row" onSubmit={(e) => { e.preventDefault(); look(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Look up a word…" maxLength={40} autoCapitalize="off" />
        <button className="btn btn-primary btn-sm" disabled={busy || !q.trim()}>{busy ? "…" : "Define"}</button>
      </form>
      {error && <p className="tool-error">{error}</p>}
      {entry === null && <p className="tool-hint">No definition found for “{q}”. Check the spelling?</p>}
      {entry && (
        <div className="dict">
          <h3>{entry.word} {entry.phonetic && <span className="muted-inline">{entry.phonetic}</span>}</h3>
          {entry.meanings.map((m, i) => (
            <div key={i} className="dict-meaning">
              <em>{m.partOfSpeech}</em>
              <ol>{m.definitions.map((d, j) => <li key={j}>{d.definition}{d.example && <div className="muted-inline">“{d.example}”</div>}</li>)}</ol>
            </div>
          ))}
          <p className="tool-hint">From the free dictionary at dictionaryapi.dev</p>
        </div>
      )}
    </div>
  );
}

/* ---------- binary & Morse code ---------- */
const MORSE: Record<string, string> = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--",
  n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "'": ".----.", "/": "-..-.", "(": "-.--.", ")": "-.--.-", ":": "---...", "=": "-...-", "+": ".-.-.", "-": "-....-", "@": ".--.-.",
};
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const CODECS: Record<string, { name: string; encode: (s: string) => string; decode: (s: string) => string }> = {
  binary: {
    name: "Binary",
    encode: (s) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(2).padStart(8, "0")).join(" "),
    decode: (s) => { try { return new TextDecoder().decode(new Uint8Array((s.match(/[01]{8}/g) || []).map((b) => parseInt(b, 2)))); } catch { return ""; } },
  },
  morse: {
    name: "Morse code",
    encode: (s) => s.toLowerCase().split(" ").map((w) => Array.from(w).map((c) => MORSE[c] || "").filter(Boolean).join(" ")).join(" / "),
    decode: (s) => s.trim().split(/\s*\/\s*/).map((w) => w.split(/\s+/).map((c) => FROM_MORSE[c] || "").join("")).join(" "),
  },
  hex: {
    name: "Hexadecimal",
    encode: (s) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, "0")).join(" "),
    decode: (s) => { try { return new TextDecoder().decode(new Uint8Array((s.match(/[0-9a-f]{2}/gi) || []).map((b) => parseInt(b, 16)))); } catch { return ""; } },
  },
  caesar: {
    name: "Caesar shift (+3)",
    encode: (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 3) % 26) + b); }),
    decode: (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 23) % 26) + b); }),
  },
};
export function CodeConverter() {
  const [codec, setCodec] = useToolState<string>("codes", "codec", "binary");
  const [plain, setPlain] = useToolState("codes", "plain", "Hello");
  const c = CODECS[codec] || CODECS.binary;
  const [coded, setCoded] = useState(() => c.encode(plain));
  const { copied, copy } = useCopy();
  const encoded = useMemo(() => c.encode(plain), [c, plain]);
  return (
    <div>
      <select value={codec} onChange={(e) => { setCodec(e.target.value); setCoded(CODECS[e.target.value].encode(plain)); }} aria-label="Code">
        {Object.entries(CODECS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
      </select>
      <label className="tool-label">Text</label>
      <textarea value={plain} onChange={(e) => { setPlain(e.target.value.slice(0, 2000)); setCoded(c.encode(e.target.value.slice(0, 2000))); }} rows={3} />
      <label className="tool-label">{c.name} <button className="link-btn" onClick={() => copy(coded || encoded)}>{copied && copied === (coded || encoded) ? "copied" : "copy"}</button></label>
      <textarea value={coded} onChange={(e) => { setCoded(e.target.value); setPlain(c.decode(e.target.value)); }} rows={4} className="mono" />
      {codec === "morse" && (
        <button className="btn btn-secondary btn-sm" onClick={() => playMorse(coded)}>▶ Play the beeps</button>
      )}
    </div>
  );
}
function playMorse(code: string) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let t = ctx.currentTime + 0.05;
    const unit = 0.08;
    for (const ch of code.slice(0, 400)) {
      if (ch === "." || ch === "-") {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 650;
        g.gain.value = 0.12;
        osc.connect(g).connect(ctx.destination);
        const len = ch === "." ? unit : unit * 3;
        osc.start(t);
        osc.stop(t + len);
        t += len + unit;
      } else t += unit * (ch === "/" ? 4 : 2);
    }
  } catch {}
}

/* ---------- password maker ---------- */
const WORDLIST = "apple river tiger cloud piano rocket maple ocean pencil garden falcon violet thunder silver planet orange castle jungle meadow comet dragon lemon breeze canyon forest island lantern marble nectar olive pepper quartz rabbit saddle tulip velvet walnut yellow zebra anchor bamboo cactus dolphin ember fossil glacier harbor igloo jigsaw kettle lizard magnet nugget orbit pebble quill radar shadow tunnel umbrella vortex willow".split(" ");
function randomInt(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}
export function PasswordMaker() {
  const [opts, setOpts] = useToolState("password", "opts", { kind: "random" as "random" | "words", length: 16, upper: true, digits: true, symbols: true, words: 4 });
  const [seed, setSeed] = useState(0);
  const { copied, copy } = useCopy();
  const pw = useMemo(() => {
    if (opts.kind === "words") {
      return Array.from({ length: opts.words }, () => WORDLIST[randomInt(WORDLIST.length)]).join("-") + "-" + randomInt(100);
    }
    let chars = "abcdefghijkmnopqrstuvwxyz";
    if (opts.upper) chars += "ABCDEFGHJKLMNPQRSTUVWXYZ";
    if (opts.digits) chars += "23456789";
    if (opts.symbols) chars += "!@#$%&*?-_+=";
    return Array.from({ length: opts.length }, () => chars[randomInt(chars.length)]).join("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts, seed]);
  const bits = opts.kind === "words" ? Math.round(opts.words * Math.log2(WORDLIST.length) + Math.log2(100))
    : Math.round(opts.length * Math.log2(25 + (opts.upper ? 24 : 0) + (opts.digits ? 8 : 0) + (opts.symbols ? 12 : 0)));
  const strength = bits >= 80 ? "very strong" : bits >= 60 ? "strong" : bits >= 45 ? "okay" : "weak";
  return (
    <div>
      <div className="seg small">
        <button className={opts.kind === "random" ? "on" : ""} onClick={() => setOpts({ ...opts, kind: "random" })}>Random</button>
        <button className={opts.kind === "words" ? "on" : ""} onClick={() => setOpts({ ...opts, kind: "words" })}>Easy to remember</button>
      </div>
      <div className="pw-out mono">{pw}</div>
      <div className="tool-row">
        <button className="btn btn-primary btn-sm" onClick={() => copy(pw)}>{copied === pw ? "Copied!" : "Copy"}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setSeed(seed + 1)}>New one</button>
        <span className={`pw-strength ${strength.replace(" ", "-")}`}>{strength} · {bits} bits</span>
      </div>
      {opts.kind === "random" ? (
        <>
          <label className="tool-label">Length: {opts.length}</label>
          <input type="range" min={8} max={40} value={opts.length} onChange={(e) => setOpts({ ...opts, length: Number(e.target.value) })} />
          <div className="tool-row small">
            {(["upper", "digits", "symbols"] as const).map((k) => (
              <label key={k} className="check-row"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {k === "upper" ? "A–Z" : k === "digits" ? "0–9" : "!@#"}</label>
            ))}
          </div>
        </>
      ) : (
        <>
          <label className="tool-label">Words: {opts.words}</label>
          <input type="range" min={3} max={7} value={opts.words} onChange={(e) => setOpts({ ...opts, words: Number(e.target.value) })} />
        </>
      )}
      <p className="tool-hint">Made on your device — it's never sent anywhere. Use a different password for every site.</p>
    </div>
  );
}

/* ---------- emoji search ---------- */
const EMOJI_WORDS: [string, string][] = [
  ["😀", "grin happy smile"], ["😂", "laugh joy tears lol"], ["🤣", "rofl rolling laugh"], ["😊", "blush happy smile"], ["😍", "love heart eyes"],
  ["🥰", "love hearts adore"], ["😎", "cool sunglasses"], ["🤓", "nerd glasses smart"], ["🤔", "thinking hmm"], ["😴", "sleep tired zzz"],
  ["😭", "cry sob sad"], ["😢", "sad tear cry"], ["😡", "angry mad rage"], ["😱", "scream shock scared"], ["🥳", "party celebrate birthday"],
  ["🤯", "mind blown shocked"], ["😬", "grimace awkward"], ["🙄", "eye roll whatever"], ["😇", "angel innocent halo"], ["🤪", "crazy silly zany"],
  ["😅", "sweat smile nervous phew"], ["🥺", "pleading puppy eyes please"], ["😤", "huff triumph steam"], ["🤗", "hug"], ["🤫", "shh quiet secret"],
  ["💀", "skull dead dying lol"], ["👻", "ghost boo halloween"], ["🤖", "robot bot ai"], ["👽", "alien ufo"], ["💩", "poop"],
  ["👍", "thumbs up yes ok like"], ["👎", "thumbs down no dislike"], ["👏", "clap applause bravo"], ["🙏", "pray please thanks"], ["💪", "strong muscle flex gym"],
  ["👋", "wave hi hello bye"], ["✌️", "peace victory"], ["🤞", "fingers crossed luck hope"], ["👀", "eyes look see"], ["🧠", "brain smart think"],
  ["❤️", "heart love red"], ["💔", "broken heart sad"], ["💜", "purple heart"], ["✨", "sparkles shiny magic"], ["🔥", "fire hot lit"],
  ["💯", "hundred perfect score"], ["✅", "check done yes tick"], ["❌", "cross no wrong"], ["⚠️", "warning caution"], ["❓", "question"],
  ["🎉", "party popper tada celebrate"], ["🏆", "trophy win champion"], ["🥇", "gold medal first"], ["⭐", "star favourite"], ["💤", "sleep zzz"],
  ["🐶", "dog puppy"], ["🐱", "cat kitten"], ["🦊", "fox"], ["🐼", "panda"], ["🦁", "lion"], ["🐸", "frog"], ["🐵", "monkey"], ["🦄", "unicorn magic"],
  ["🐢", "turtle slow"], ["🐍", "snake"], ["🦖", "dinosaur t-rex"], ["🐙", "octopus"], ["🐬", "dolphin"], ["🦈", "shark"], ["🦋", "butterfly"],
  ["🌸", "flower blossom spring"], ["🌻", "sunflower"], ["🌈", "rainbow"], ["☀️", "sun sunny weather"], ["🌙", "moon night"], ["❄️", "snow cold winter"],
  ["⚡", "lightning zap electric"], ["🌍", "earth world globe"], ["🍕", "pizza food"], ["🍔", "burger food"], ["🍟", "fries chips"], ["🍩", "donut"],
  ["🍪", "cookie biscuit"], ["🎂", "cake birthday"], ["🍫", "chocolate"], ["🍿", "popcorn movie"], ["☕", "coffee tea hot drink"], ["🍎", "apple fruit"],
  ["🍌", "banana"], ["🍉", "watermelon summer"], ["⚽", "football soccer ball"], ["🏀", "basketball"], ["🎾", "tennis"], ["🎮", "game controller gaming"],
  ["🕹️", "joystick arcade"], ["🎲", "dice random game"], ["♟️", "chess pawn"], ["🎯", "target dart goal"], ["🎨", "art paint palette"], ["🎬", "film movie clapper"],
  ["🎵", "music note song"], ["🎧", "headphones music"], ["🎸", "guitar rock"], ["🎹", "piano keyboard music"], ["📚", "books study school"], ["📝", "memo notes write"],
  ["✏️", "pencil write"], ["📐", "ruler triangle maths geometry"], ["🧮", "abacus maths count"], ["🔬", "microscope science"], ["🧪", "test tube science lab"],
  ["💻", "laptop computer code"], ["📱", "phone mobile"], ["⌨️", "keyboard typing"], ["💡", "idea light bulb"], ["📌", "pin pushpin"], ["📅", "calendar date"],
  ["⏰", "alarm clock time"], ["🎒", "backpack school bag"], ["🏫", "school"], ["🚀", "rocket launch space"], ["✈️", "plane travel"], ["🚗", "car"],
  ["🚲", "bike bicycle"], ["🏠", "house home"], ["🎁", "gift present"], ["🔒", "lock secure"], ["🔑", "key"], ["💰", "money bag"], ["🧩", "puzzle piece"],
];
export function EmojiSearch() {
  const [q, setQ] = useToolState("emoji", "q", "");
  const [recent, setRecent] = useToolState<string[]>("emoji", "recent", []);
  const { copied, copy } = useCopy();
  const list = useMemo(() => {
    const all = new Map<string, string>(EMOJI_WORDS);
    for (const [name, e] of Object.entries(SHORTCODES)) all.set(e, `${all.get(e) || ""} ${name}`);
    const term = q.trim().toLowerCase();
    return Array.from(all.entries()).filter(([, words]) => !term || words.includes(term));
  }, [q]);
  const pick = (e: string) => { copy(e); setRecent([e, ...recent.filter((x) => x !== e)].slice(0, 16)); };
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: happy, pizza, rocket…" autoFocus />
      {recent.length > 0 && !q && <div className="emoji-grid recent">{recent.map((e) => <button key={e} onClick={() => pick(e)} title="Copy">{e}</button>)}</div>}
      <div className="emoji-grid">
        {list.map(([e, words]) => <button key={e} onClick={() => pick(e)} title={words.trim()}>{e}</button>)}
      </div>
      {list.length === 0 && <p className="tool-hint">No emoji for that word.</p>}
      <p className="tool-hint" aria-live="polite">{copied ? `Copied ${copied}` : "Click an emoji to copy it."}</p>
    </div>
  );
}

/* ---------- word, quote and fact of the day ---------- */
export function Daily() {
  const w = todaysWord();
  const q = todaysQuote();
  const f = todaysFact();
  return (
    <div className="daily-cards">
      <section><span className="tt-label">📖 Word of the day</span><h3>{w.word} <em className="muted-inline">{w.type}</em></h3><p>{w.meaning}</p><p className="muted-inline">“{w.example}”</p></section>
      <section><span className="tt-label">💬 Quote of the day</span><blockquote>“{q.text}”</blockquote><p className="muted-inline">— {q.by}</p></section>
      <section><span className="tt-label">🧠 Fact of the day</span><p>{f}</p></section>
    </div>
  );
}
