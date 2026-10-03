"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { uid, useSynced, useToolState } from "./shared";

/* ---------- flashcards ---------- */
interface Card { id: string; front: string; back: string; box: number }
interface Deck { id: string; name: string; cards: Card[] }
export function Flashcards() {
  const { value: decks, set, ready, error } = useSynced<Deck[]>("flashcards", []);
  const [openId, setOpenId] = useToolState<string | null>("flashcards", "open", null);
  const [mode, setMode] = useState<"edit" | "study">("edit");
  const [name, setName] = useState("");
  const deck = decks.find((d) => d.id === openId);
  const saveDeck = (d: Deck) => set(decks.map((x) => (x.id === d.id ? d : x)));
  if (!ready) return <div className="skeleton skel-line" />;
  if (!deck) {
    return (
      <div>
        <form className="tool-row" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const d = { id: uid(), name: name.trim().slice(0, 60), cards: [] };
          set([...decks, d].slice(0, 30));
          setName(""); setOpenId(d.id); setMode("edit");
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New deck, e.g. French verbs" maxLength={60} />
          <button className="btn btn-primary btn-sm" disabled={!name.trim()}>Create</button>
        </form>
        {decks.length === 0 && <p className="tool-hint">Make a deck, add cards, then study them. Cards you get right come up less often.</p>}
        <ul className="tool-list">
          {decks.map((d) => {
            const learned = d.cards.filter((c) => c.box >= 3).length;
            return (
              <li key={d.id}>
                <button className="note-open" onClick={() => { setOpenId(d.id); setMode(d.cards.length ? "study" : "edit"); }}>
                  <strong>{d.name}</strong>
                  <span className="muted-inline">{d.cards.length} cards · {learned} learned</span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p className="tool-error">{error}</p>}
      </div>
    );
  }
  return (
    <div>
      <div className="tool-row">
        <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(null)}>← Decks</button>
        <strong className="grow">{deck.name}</strong>
        <div className="seg small">
          <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>Cards</button>
          <button className={mode === "study" ? "on" : ""} disabled={!deck.cards.length} onClick={() => setMode("study")}>Study</button>
        </div>
      </div>
      {mode === "edit" ? (
        <DeckEditor deck={deck} save={saveDeck} remove={() => { if (confirm(`Delete “${deck.name}”?`)) { set(decks.filter((d) => d.id !== deck.id)); setOpenId(null); } }} />
      ) : (
        <Study deck={deck} save={saveDeck} />
      )}
      {error && <p className="tool-error">{error}</p>}
    </div>
  );
}

function DeckEditor({ deck, save, remove }: { deck: Deck; save: (d: Deck) => void; remove: () => void }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const add = (cards: { front: string; back: string }[]) => {
    save({ ...deck, cards: [...deck.cards, ...cards.map((c) => ({ id: uid(), front: c.front.slice(0, 300), back: c.back.slice(0, 500), box: 0 }))].slice(0, 500) });
  };
  return (
    <div>
      <form className="tool-form" onSubmit={(e) => { e.preventDefault(); if (front.trim() && back.trim()) { add([{ front: front.trim(), back: back.trim() }]); setFront(""); setBack(""); } }}>
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front (question / word)" />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back (answer / meaning)" />
        <div className="tool-row">
          <button className="btn btn-primary btn-sm" disabled={!front.trim() || !back.trim()}>Add card</button>
          <button type="button" className="link-btn" onClick={() => setShowBulk(!showBulk)}>Paste a list</button>
        </div>
      </form>
      {showBulk && (
        <div className="tool-form">
          <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={5} placeholder={"One card per line: front - back\nchat - cat\nchien - dog"} />
          <button className="btn btn-secondary btn-sm" onClick={() => {
            const cards = bulk.split("\n").map((l) => l.split(/\s+[-–—=:\t]\s+|\t/)).filter((p) => p.length >= 2 && p[0].trim() && p[1].trim()).map((p) => ({ front: p[0].trim(), back: p.slice(1).join(" - ").trim() }));
            if (cards.length) { add(cards); setBulk(""); setShowBulk(false); }
          }}>Add these</button>
        </div>
      )}
      <ul className="tool-list deck-cards">
        {deck.cards.map((c) => (
          <li key={c.id}>
            <span><strong>{c.front}</strong> — {c.back}</span>
            <span className="muted-inline">{"●".repeat(Math.min(c.box, 4)) || "new"}</span>
            <button className="btn-icon sm" aria-label="Delete card" onClick={() => save({ ...deck, cards: deck.cards.filter((x) => x.id !== c.id) })}>×</button>
          </li>
        ))}
      </ul>
      <button className="link-btn danger" onClick={remove}>Delete deck</button>
    </div>
  );
}

/** Leitner boxes: right answers move a card up a box (seen less), wrong ones send it back to the start. */
function Study({ deck, save }: { deck: Deck; save: (d: Deck) => void }) {
  const pickNext = (cards: Card[], avoid?: string) => {
    const weighted = cards.flatMap((c) => Array(Math.max(1, 5 - c.box)).fill(c) as Card[]).filter((c) => c.id !== avoid || cards.length === 1);
    return weighted[Math.floor(Math.random() * weighted.length)]?.id;
  };
  const [cardId, setCardId] = useState(() => pickNext(deck.cards));
  const [flipped, setFlipped] = useState(false);
  const [reverse, setReverse] = useToolState("flashcards", "reverse", false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const card = deck.cards.find((c) => c.id === cardId) || deck.cards[0];
  if (!card) return <p className="tool-hint">Add some cards first.</p>;
  const answer = (right: boolean) => {
    const cards = deck.cards.map((c) => (c.id === card.id ? { ...c, box: right ? Math.min(5, c.box + 1) : 0 } : c));
    save({ ...deck, cards });
    setScore((s) => ({ right: s.right + (right ? 1 : 0), wrong: s.wrong + (right ? 0 : 1) }));
    setFlipped(false);
    setCardId(pickNext(cards, card.id));
  };
  const front = reverse ? card.back : card.front;
  const back = reverse ? card.front : card.back;
  return (
    <div className="center">
      <button className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show the front" : "Show the answer"}>
        <span className="fc-side">{flipped ? back : front}</span>
        <span className="fc-hint">{flipped ? "answer" : "tap to flip"}</span>
      </button>
      {flipped ? (
        <div className="tool-row center">
          <button className="btn btn-danger" onClick={() => answer(false)}>✗ Not yet</button>
          <button className="btn btn-success" onClick={() => answer(true)}>✓ Got it</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setFlipped(true)}>Show answer</button>
      )}
      <div className="tool-row center small">
        <span className="muted-inline">✓ {score.right} · ✗ {score.wrong} · {deck.cards.filter((c) => c.box >= 3).length}/{deck.cards.length} learned</span>
        <label className="check-row"><input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} /> Back first</label>
      </div>
    </div>
  );
}

/* ---------- habit tracker ---------- */
interface Habit { id: string; name: string; emoji: string; days: string[] }
const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function streak(days: string[]) {
  const set = new Set(days);
  const d = new Date();
  if (!set.has(dayStr(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break it
  let n = 0;
  while (set.has(dayStr(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function Habits() {
  const { value, set, ready, error } = useSynced<Habit[]>("habits", []);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📖");
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; }), []);
  const toggle = (h: Habit, day: string) => set(value.map((x) => (x.id === h.id ? { ...x, days: x.days.includes(day) ? x.days.filter((d) => d !== day) : [...x.days, day].sort().slice(-400) } : x)));
  return (
    <div>
      <form className="tool-row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { set([...value, { id: uid(), name: name.trim().slice(0, 40), emoji, days: [] }].slice(0, 20)); setName(""); } }}>
        <input className="emoji-in" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Read 20 minutes" maxLength={40} />
        <button className="btn btn-primary btn-sm" disabled={!name.trim()}>Add</button>
      </form>
      {!ready && <div className="skeleton skel-line" />}
      {ready && value.length === 0 && <p className="tool-hint">Track small daily habits. Only you can see them.</p>}
      {value.length > 0 && (
        <table className="habits">
          <thead><tr><th />{week.map((d) => <th key={d.toISOString()}>{d.toLocaleDateString(undefined, { weekday: "narrow" })}</th>)}<th>🔥</th><th /></tr></thead>
          <tbody>
            {value.map((h) => (
              <tr key={h.id}>
                <td className="habit-name">{h.emoji} {h.name}</td>
                {week.map((d) => {
                  const ds = dayStr(d);
                  const on = h.days.includes(ds);
                  return <td key={ds}><button className={`habit-cell ${on ? "on" : ""}`} aria-pressed={on} aria-label={`${h.name} on ${d.toDateString()}`} onClick={() => toggle(h, ds)}>{on ? "✓" : ""}</button></td>;
                })}
                <td><strong>{streak(h.days)}</strong></td>
                <td><button className="btn-icon sm" aria-label={`Delete ${h.name}`} onClick={() => { if (confirm(`Stop tracking “${h.name}”?`)) set(value.filter((x) => x.id !== h.id)); }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="tool-error">{error}</p>}
    </div>
  );
}

/* ---------- typing speed test ---------- */
const PASSAGES = [
  "The quick brown fox jumps over the lazy dog while the sleepy cat watches from the warm windowsill.",
  "Practice a little every day and you will be surprised how quickly your fingers learn where every key lives.",
  "On a clear night you can see thousands of stars, and some of them are so far away that their light left long before you were born.",
  "Good notes are short, clear and written in your own words, so they still make sense when you read them again before a test.",
  "The library was quiet except for the soft sound of pages turning and someone typing very fast in the corner.",
  "A strong password is long and hard to guess, and you should never use the same one on two different websites.",
  "Rivers carve valleys over millions of years, carrying tiny grains of sand from the mountains all the way to the sea.",
  "When the bell rang, everyone packed their bags, pushed in their chairs and hurried outside into the sunshine.",
  "Bees dance to tell each other where the best flowers are, and the angle of the dance points the way.",
  "Learning to code is a bit like learning a new language: small steps, lots of mistakes, and then suddenly it clicks.",
];
/** three passages in a row — long enough to give a fair speed */
function makeText() {
  const pool = [...PASSAGES].sort(() => Math.random() - 0.5);
  return pool.slice(0, 3).join(" ");
}
interface TypingRow { user: string; wpm: number; accuracy: number; at: string }
export function TypingTest({ user }: { user?: string | null }) {
  const [text, setText] = useState(makeText);
  const [typed, setTyped] = useState("");
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [best, setBest] = useToolState<{ wpm: number; accuracy: number } | null>("typing", "best", null);
  const [board, setBoard] = useState<TypingRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    if (!start || end) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [start, end]);
  useEffect(() => {
    fetch("/api/tools?typing=1").then((r) => r.json()).then((j) => setBoard(j.board || [])).catch(() => setBoard([]));
  }, []);
  const elapsed = start ? (end || Date.now()) - start : 0;
  const correct = Array.from(typed).filter((c, i) => c === text[i]).length;
  const wpm = elapsed > 1000 ? Math.round(correct / 5 / (elapsed / 60_000)) : 0;
  const accuracy = typed.length + mistakes ? Math.round((correct / (typed.length + mistakes)) * 100) : 100;
  const reset = (next = true) => {
    if (next) setText(makeText());
    setTyped(""); setStart(null); setEnd(null); setMistakes(0); setMsg("");
    setTimeout(() => input.current?.focus(), 0);
  };
  const finish = async (finalTyped: string, at: number) => {
    setEnd(at);
    const ms = at - (start || at);
    const chars = Array.from(finalTyped).filter((c, i) => c === text[i]).length;
    const w = Math.round(chars / 5 / (ms / 60_000));
    const acc = Math.round((chars / (finalTyped.length + mistakes)) * 100);
    if (!best || w > best.wpm) setBest({ wpm: w, accuracy: acc });
    if (!user) { setMsg("Log in to get on the leaderboard."); return; }
    if (ms < 15_000) { setMsg("Nice! Tests under 15 seconds don't count for the leaderboard — try a longer go."); return; }
    try {
      const res = await fetch("/api/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "typing", chars, ms, accuracy: acc }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setBoard(j.board);
      setMsg(!j.counted ? "Get 85% accuracy or more to count for the leaderboard." : j.best?.wpm === w ? "🏆 New personal best on the board!" : "Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save your score");
    }
  };
  return (
    <div>
      <p className="typing-text mono" onClick={() => input.current?.focus()} aria-hidden="true">
        {Array.from(text).map((c, i) => (
          <span key={i} className={i < typed.length ? (typed[i] === c ? "ok" : "bad") : i === typed.length ? "cur" : ""}>{c}</span>
        ))}
      </p>
      <textarea
        ref={input}
        className="typing-in"
        value={typed}
        disabled={!!end}
        aria-label={`Type this: ${text}`}
        autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onPaste={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value.slice(0, text.length);
          const now = Date.now();
          if (!start) setStart(now);
          if (v.length > typed.length && v[v.length - 1] !== text[v.length - 1]) setMistakes((m) => m + 1);
          setTyped(v);
          if (v.length === text.length) finish(v, now);
        }}
        rows={2}
        placeholder="Start typing the text above…"
      />
      <div className="stat-grid">
        <div><strong>{wpm}</strong><span>words / min</span></div>
        <div><strong>{accuracy}%</strong><span>accuracy</span></div>
        <div><strong>{Math.round(elapsed / 1000)}s</strong><span>time</span></div>
        <div><strong>{best?.wpm ?? "—"}</strong><span>your best</span></div>
      </div>
      {msg && <p className="tool-hint">{msg}</p>}
      <div className="tool-row">
        <button className="btn btn-secondary btn-sm" onClick={() => reset(true)}>New text</button>
        {typed && <button className="btn btn-secondary btn-sm" onClick={() => reset(false)}>Restart</button>}
      </div>
      <h4 className="tool-sub">🏆 Leaderboard</h4>
      {!board && <div className="skeleton skel-line" />}
      {board && board.length === 0 && <p className="tool-hint">No scores yet — be the first!</p>}
      <ol className="tool-list board">
        {board?.map((r, i) => (
          <li key={r.user} className={r.user.toLowerCase() === user?.toLowerCase() ? "me" : ""}>
            <span>{["🥇", "🥈", "🥉"][i] || i + 1} {r.user}</span><strong>{r.wpm} wpm</strong><span className="muted-inline">{r.accuracy}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
