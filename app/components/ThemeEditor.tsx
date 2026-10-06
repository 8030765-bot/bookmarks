"use client";
import { useState } from "react";
import { Folder } from "@/lib/types";
import { Icon } from "./Icon";
import { COLORS, readLocal } from "./ui";
import { useSavedTick } from "./guard";
import {
  DEFAULT_LOOK, DEFAULT_ORDER, FONTS, HIDEABLE, Look, PALETTES, SECTIONS, Section, decodeTheme, encodeTheme,
} from "./look";

type Tab = "colours" | "text" | "layout" | "effects" | "access" | "share";
const TABS: { id: Tab; label: string }[] = [
  { id: "colours", label: "Colours" },
  { id: "text", label: "Text" },
  { id: "layout", label: "Layout" },
  { id: "effects", label: "Effects" },
  { id: "access", label: "Accessibility" },
  { id: "share", label: "Share" },
];

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row compact">
      <div><strong>{label}</strong>{hint && <span>{hint}</span>}</div>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, l]) => <button key={v} type="button" className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

/** A small live sample of the site, drawn with the same CSS as the real thing. */
function Preview() {
  return (
    <div className="theme-preview" aria-hidden="true">
      <div className="tp-title">Made by Theo 7A</div>
      <div className="folder-card tp-folder" style={{ "--folder-accent": "var(--accent)" } as React.CSSProperties}>
        <div className="fh"><span className="fh-toggle"><span className="fh-emoji">🧮</span><span className="fh-name">Maths</span><span className="fh-count">2</span></span></div>
        <div className="cards">
          {[["Desmos", "desmos.com", "D"], ["Khan Academy", "khanacademy.org", "K"]].map(([n, h, l]) => (
            <div key={n} className="card"><span className="card-main"><span className="card-icon"><span className="tp-fav">{l}</span></span><span className="card-body"><span className="card-name">{n}</span><span className="card-host">{h}</span></span></span></div>
          ))}
        </div>
      </div>
      <div className="tp-row"><span className="btn btn-primary btn-sm">Add website</span><span className="pill approved">tag</span><a href="#" onClick={(e) => e.preventDefault()}>a link</a></div>
    </div>
  );
}

export function ThemeEditor({ look, onChange, onClose, startView, onStartView, folders = [], unlocked, themeOfMonth, admin, onAdminTheme, onProfileTheme }: {
  look: Look;
  onChange: (l: Look) => void;
  onClose: () => void;
  startView?: string;
  onStartView?: (v: string) => void;
  folders?: Folder[];
  /** secret palettes you've found */
  unlocked: string[];
  themeOfMonth?: { code: string; name: string };
  admin?: boolean;
  onAdminTheme?: (kind: "default" | "month", code: string, name?: string) => void;
  /** show this theme on your profile (logged in only) */
  onProfileTheme?: (code: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(() => readLocal("themeTab", "colours") as Tab);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const { saved, tick } = useSavedTick();
  const set = (patch: Partial<Look>) => { onChange({ ...look, ...patch }); saved(); };
  const code = encodeTheme(look);
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const moveSection = (s: Section, dir: -1 | 1) => {
    const order = [...look.order];
    const i = order.indexOf(s);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set({ order });
  };
  const toggleHide = (id: string) => set({ hide: look.hide.includes(id) ? look.hide.filter((x) => x !== id) : [...look.hide, id] });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wide theme-editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Customize the look">
        <h2>🎨 Customize{tick > 0 && <span key={tick} className="saved-tick" role="status">✓ Saved</span>}</h2>
        <p className="modal-text">Only changes how the site looks for you. Changes show straight away.</p>
        <Preview />
        <div className="seg te-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => { setTab(t.id); try { localStorage.setItem("themeTab", JSON.stringify(t.id)); } catch {} }}>{t.label}</button>
          ))}
        </div>

        {tab === "colours" && (
          <>
            {themeOfMonth && (
              <div className="te-month">
                <span>🗓️ Theme of the month: <strong>{themeOfMonth.name}</strong></span>
                <button className="btn btn-secondary btn-sm" onClick={() => { const t = decodeTheme(themeOfMonth.code); if (t) { set(t); say("Theme of the month applied"); } }}>Try it</button>
              </div>
            )}
            <div className="form-group">
              <label>Theme</label>
              <div className="palette-grid">
                {PALETTES.map((p) => {
                  const locked = !!p.secret && !unlocked.includes(p.id);
                  return (
                    <button key={p.id} className={`palette ${look.palette === p.id ? "on" : ""} ${locked ? "locked" : ""}`} disabled={locked} title={locked ? p.secret : p.label}
                      onClick={() => set({ palette: p.id })}>
                      <span className="palette-swatch" style={{ background: locked ? undefined : `linear-gradient(135deg, ${p.swatch[0]} 50%, ${p.swatch[1]} 50%)` }}>{locked ? "🔒" : ""}</span>
                      {locked ? "???" : p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-group">
              <label>Accent colour</label>
              <div className="swatches">
                <button type="button" className={`swatch none ${!look.accent ? "on" : ""}`} onClick={() => set({ accent: "" })} title="Default">×</button>
                {COLORS.map((c) => <button type="button" key={c} className={`swatch ${look.accent === c ? "on" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} title={c} aria-label={`Accent ${c}`} />)}
                <label className="swatch custom" title="Pick any colour">
                  <input type="color" value={look.accent || "#7c6cff"} onChange={(e) => set({ accent: e.target.value })} aria-label="Pick any accent colour" />
                  <Icon name="palette" />
                </label>
              </div>
            </div>
            <Seg label="Go dark automatically" value={look.autoDark} onChange={(v) => set({ autoDark: v })}
              options={[["off", "No"], ["time", "On a schedule"], ["system", "Follow my device"]]} />
            {look.autoDark === "time" && (
              <div className="form-group dark-hours">
                <label>Dark from</label>
                <select value={look.darkFrom} onChange={(e) => set({ darkFrom: Number(e.target.value) })} aria-label="Dark from">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
                <label>until</label>
                <select value={look.darkTo} onChange={(e) => set({ darkTo: Number(e.target.value) })} aria-label="Dark until">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
              </div>
            )}
            <Seg label="Background" value={look.bg} onChange={(v) => set({ bg: v })}
              options={[["none", "Plain"], ["dots", "Dots"], ["grid", "Grid"], ["stripes", "Stripes"], ["gradient", "Gradient"], ["aurora", "Aurora"]]} />
          </>
        )}

        {tab === "text" && (
          <>
            <div className="form-group">
              <label>Font</label>
              <select value={look.font} onChange={(e) => set({ font: e.target.value as Look["font"] })}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Text size: {Math.round(look.fontScale * 100)}%</label>
              <input type="range" min={0.8} max={1.4} step={0.05} value={look.fontScale} onChange={(e) => set({ fontScale: Number(e.target.value) })} />
              <span className="hint">This adds to your browser&apos;s own text size setting.</span>
            </div>
            <Seg label="Text weight" value={look.weight} onChange={(v) => set({ weight: v })} options={[["light", "Light"], ["normal", "Normal"], ["bold", "Bold"]]} />
            <div className="form-group">
              <label>Line spacing: {look.lineHeight.toFixed(1)}</label>
              <input type="range" min={1.2} max={2} step={0.1} value={look.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })} />
            </div>
            <Seg label="Language · Idioma" value={look.lang} onChange={(v) => set({ lang: v })} options={[["auto", "Automatic"], ["en", "English"], ["es", "Español"]]} />
            <Seg label="Icons" value={look.iconStyle} onChange={(v) => set({ iconStyle: v })} options={[["line", "Line icons"], ["emoji", "Emoji icons"]]} />
            <Seg label="Emoji style" value={look.emojiFont} onChange={(v) => set({ emojiFont: v })} options={[["device", "My device's"], ["noto", "Google's (same everywhere)"]]} />
            <Toggle label="Greeting" hint="“Good morning, …” under the title." checked={look.greeting} onChange={(v) => set({ greeting: v })} />
          </>
        )}

        {tab === "layout" && (
          <>
            <Seg label="Card size" value={look.density} onChange={(v) => set({ density: v })} options={[["compact", "Compact"], ["comfy", "Comfortable"], ["large", "Large"]]} />
            <Seg label="Card style" value={look.cardStyle} onChange={(v) => set({ cardStyle: v })} options={[["flat", "Flat"], ["outlined", "Outlined"], ["glass", "Glass"]]} />
            <Seg label="When you point at a card" value={look.hover} onChange={(v) => set({ hover: v })} options={[["none", "Nothing"], ["lift", "Lift"], ["glow", "Glow"]]} />
            <Seg label="Folder headers" value={look.folderHeader} onChange={(v) => set({ folderHeader: v })} options={[["plain", "Plain"], ["tinted", "Tinted"], ["banner", "Banner"], ["underline", "Underline"]]} />
            <Seg label="Page width" value={look.width} onChange={(v) => set({ width: v })} options={[["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"], ["full", "Full"]]} />
            <div className="form-group">
              <label>Corner roundness: {look.radius}px</label>
              <input type="range" min={0} max={28} value={look.radius} onChange={(e) => set({ radius: Number(e.target.value) })} />
            </div>
            <Toggle label="Icon-only grid" hint="Just the icons, with small names — fits lots on screen." checked={look.iconGrid} onChange={(v) => set({ iconGrid: v })} />
            <Toggle label="Card borders in the folder's colour" checked={look.folderBorders} onChange={(v) => set({ folderBorders: v })} />
            <Toggle label="Folder list down the left" hint="On wide screens." checked={look.sideNav} onChange={(v) => set({ sideNav: v })} />
            <Toggle label="Smaller header" checked={look.smallHeader} onChange={(v) => set({ smallHeader: v })} />
            <Toggle label="Sticky folder names" hint="A folder's name stays at the top while you scroll through it." checked={look.stickyHeaders} onChange={(v) => set({ stickyHeaders: v })} />
            <Toggle label="Focus mode" hint="Just the websites — hides chat, the leaderboard, Today, polls and other extras." checked={look.focus} onChange={(v) => set({ focus: v })} />
            <Toggle label="Show descriptions" hint="A line about each site under its name." checked={look.descriptions} onChange={(v) => set({ descriptions: v })} />
            <Toggle label="Extra folders" hint="“Recently added”, “Most popular” and “Top rated”." checked={look.specialFolders} onChange={(v) => set({ specialFolders: v })} />
            <Toggle label="Hide empty folders" checked={look.hideEmpty} onChange={(v) => set({ hideEmpty: v })} />
            <Toggle label="Colour cards by their icon" checked={look.iconTint} onChange={(v) => set({ iconTint: v })} />
            <Toggle label="Open websites in a new tab" checked={look.newTab} onChange={(v) => set({ newTab: v })} />
            <div className="form-group">
              <label>Homepage order</label>
              {look.order.map((s, i) => (
                <div key={s} className="te-order">
                  <span>{SECTIONS.find((x) => x.id === s)?.label}</span>
                  <button className="btn-icon sm" disabled={i === 0} onClick={() => moveSection(s, -1)} aria-label="Move up" title="Move up"><Icon name="up" /></button>
                  <button className="btn-icon sm" disabled={i === look.order.length - 1} onClick={() => moveSection(s, 1)} aria-label="Move down" title="Move down"><Icon name="down" /></button>
                </div>
              ))}
              {look.order.join() !== DEFAULT_ORDER.join() && <button className="link-btn" onClick={() => set({ order: DEFAULT_ORDER })}>Back to the normal order</button>}
            </div>
            <div className="form-group">
              <label>Hide parts you don&apos;t use</label>
              <div className="chip-grid">
                {HIDEABLE.map((h) => <button key={h.id} className={`pick ${look.hide.includes(h.id) ? "" : "on"}`} aria-pressed={!look.hide.includes(h.id)} onClick={() => toggleHide(h.id)}>{look.hide.includes(h.id) ? "○" : "●"} {h.label}</button>)}
              </div>
            </div>
            {onStartView && (
              <div className="form-group">
                <label>Open the site at</label>
                <select value={startView || "top"} onChange={(e) => onStartView(e.target.value)}>
                  <option value="top">The top</option>
                  <option value="later">My Read later list</option>
                  <option value="favorites">My favorites</option>
                  {folders.map((f) => <option key={f.id} value={`folder:${f.id}`}>{f.emoji} {f.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        {tab === "effects" && (
          <>
            <Toggle label="Animations" hint="Off also happens automatically if your device asks for less motion." checked={look.motion} onChange={(v) => set({ motion: v })} />
            <Toggle label="Moving background" checked={look.animatedBg} onChange={(v) => set({ animatedBg: v })} />
            <Toggle label="Colourful site title" checked={look.gradientTitle} onChange={(v) => set({ gradientTitle: v })} />
            <Toggle label="Glow" hint="A soft glow on buttons and highlights." checked={look.glow} onChange={(v) => set({ glow: v })} />
            <Toggle label="Sparkles when you click" checked={look.sparkles} onChange={(v) => set({ sparkles: v })} />
            <Toggle label="Seasonal touches" hint="Holiday colours and logos that switch on by themselves." checked={look.seasonal} onChange={(v) => set({ seasonal: v })} />
            <Toggle label="Falling snow in December" checked={look.snow} onChange={(v) => set({ snow: v })} />
            <Toggle label="Minimal" hint="No emoji in folders and lists — just words." checked={look.minimal} onChange={(v) => set({ minimal: v })} />
            <Toggle label="Vibration on phones" hint="A little buzz when you tap, star or swipe." checked={look.haptics} onChange={(v) => set({ haptics: v })} />
          </>
        )}

        {tab === "access" && (
          <>
            <Toggle label="High contrast" hint="Stronger text and borders." checked={look.highContrast} onChange={(v) => set({ highContrast: v })} />
            <Toggle label="Colourblind-safe colours" hint="Blue and orange instead of green and red." checked={look.colorblind} onChange={(v) => set({ colorblind: v })} />
            <Toggle label="Always underline links" checked={look.underline} onChange={(v) => set({ underline: v })} />
            <Toggle label="Bigger buttons" hint="Easier to tap on phones and tablets." checked={look.bigButtons} onChange={(v) => set({ bigButtons: v })} />
            <Toggle label="Warn before leaving" hint="Ask before opening a website that isn't on the shared list (links in chat, the wiki and posts)." checked={look.leaveWarn} onChange={(v) => set({ leaveWarn: v })} />
            <Toggle label="Animations" hint="Turn off to reduce motion." checked={look.motion} onChange={(v) => set({ motion: v })} />
            <p className="hint">Tip: press <span className="kbd">?</span> for keyboard shortcuts, and use <strong>What&apos;s this?</strong> in the ⋯ menu to learn what any button does.</p>
          </>
        )}

        {tab === "share" && (
          <>
            <div className="form-group">
              <label>Your theme code</label>
              <div className="status-row">
                <input readOnly value={code} className="mono" onFocus={(e) => e.target.select()} aria-label="Theme code" />
                <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(code).then(() => say("Copied — send it to a friend"))}>Copy</button>
              </div>
            </div>
            <div className="form-group">
              <label>Use someone else&apos;s theme</label>
              <div className="status-row">
                <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a code starting TB1." className="mono" aria-label="Paste a theme code" />
                <button className="btn btn-primary btn-sm" disabled={!paste.trim()} onClick={() => {
                  const t = decodeTheme(paste);
                  if (!t) return say("That isn't a theme code");
                  const lockedPalette = t.palette && PALETTES.find((p) => p.id === t.palette)?.secret && !unlocked.includes(t.palette);
                  set(lockedPalette ? { ...t, palette: look.palette } : t);
                  setPaste("");
                  say(lockedPalette ? "Applied — except a secret theme you haven't found yet 😉" : "Theme applied");
                }}>Apply</button>
              </div>
            </div>
            {onProfileTheme && <button className="btn btn-secondary btn-sm" onClick={() => { onProfileTheme(code); say("Your profile now shows this theme"); }}>Show this theme on my profile</button>}
            {admin && onAdminTheme && (
              <div className="te-admin">
                <strong>Admin</strong>
                <button className="btn btn-secondary btn-sm" onClick={() => { onAdminTheme("default", code); say("New visitors will start with this theme"); }}>Make this the default for new visitors</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { const name = prompt("Name this theme of the month:", "October vibes"); if (name) { onAdminTheme("month", code, name); say("Theme of the month set"); } }}>Make this the theme of the month</button>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          {msg && <span className="te-msg" role="status">{msg}</span>}
          <button className="btn btn-secondary" onClick={() => onChange(DEFAULT_LOOK)}>Reset everything</button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
