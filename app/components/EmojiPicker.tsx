"use client";
import { useMemo, useState } from "react";
import { SHORTCODES } from "./ChatText";

const GROUPS: [string, string][] = [
  ["😀", "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😴 😪 🤤 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 💀 👻 👽 🤖 💩"],
  ["👍", "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 👏 🙌 👐 🤲 🙏 ✍️ 💪 🦾 🧠 👀 👁️ 👅 👄"],
  ["❤️", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ ⭐ 🌟 💫 🔥 💯 ✅ ❌ ⚠️ ❓ ❗ 💤 💬 🎉 🎊 🏆 🥇 🥈 🥉"],
  ["🐶", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🐺 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦑 🐠 🐬 🐳 🦈 🌵 🌲 🌸 🌻 🍀 🌈 ☀️ 🌙 ❄️ ⚡"],
  ["🍕", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🍞 🧀 🥚 🍳 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🍝 🍜 🍣 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 🥤 🧃 ☕"],
  ["⚽", "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🏒 ⛳ 🏹 🎣 🥊 🛹 🛼 ⛸️ 🎿 🏆 🎮 🕹️ 🎲 ♟️ 🎯 🎳 🎨 🎬 🎤 🎧 🎵 🎹 🥁 🎸 🎻"],
  ["📚", "📚 📖 📝 ✏️ 🖊️ 📐 📏 🧮 🔬 🔭 🧪 🧬 💻 🖥️ ⌨️ 🖱️ 📱 📷 🔋 💡 📌 📎 ✂️ 🗂️ 📅 ⏰ 🎒 🏫 🚀 ✈️ 🚗 🚲 🗺️ 🏠"],
];

/** A bigger emoji picker with groups and search by :shortcode: name. */
export default function EmojiPicker({ onPick, recent }: { onPick: (emoji: string) => void; recent: string[] }) {
  const [group, setGroup] = useState(0);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return Object.entries(SHORTCODES).filter(([name]) => name.includes(t)).map(([, e]) => e);
  }, [q]);
  const list = results || (group >= 0 ? GROUPS[group][1].split(" ") : recent);
  return (
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
      <input className="ep-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search (heart, fire, party…)" aria-label="Search emoji" />
      {!results && (
        <div className="ep-tabs">
          {recent.length > 0 && <button type="button" className={group === -1 ? "on" : ""} onClick={() => setGroup(-1)} title="Recent">🕘</button>}
          {GROUPS.map(([icon], i) => <button type="button" key={icon} className={group === i ? "on" : ""} onClick={() => setGroup(i)}>{icon}</button>)}
        </div>
      )}
      <div className="ep-grid">
        {list.map((em, i) => (
          <button type="button" key={`${em}${i}`} onClick={() => onPick(em)}>{em}</button>
        ))}
        {results && results.length === 0 && <span className="muted-inline">No match</span>}
      </div>
    </div>
  );
}
