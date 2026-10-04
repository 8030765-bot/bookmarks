/**
 * How the site looks for you: colours, text, layout, effects and
 * accessibility. Everything is applied as attributes and CSS variables on
 * <html>, so the CSS does the work and nothing re-renders.
 */
export type Palette =
  | "black" | "dim" | "ocean" | "forest" | "sunset" | "light"
  | "grape" | "rose" | "slate" | "mocha" | "mint" | "paper"
  | "retro" | "terminal"
  // secret ones, unlocked by easter eggs
  | "neon" | "gold" | "galaxy";

export const PALETTES: { id: Palette; label: string; swatch: [string, string]; light?: boolean; secret?: string }[] = [
  { id: "black", label: "True black", swatch: ["#000", "#1f1f1f"] },
  { id: "dim", label: "Dim", swatch: ["#15171c", "#2a2e37"] },
  { id: "ocean", label: "Ocean", swatch: ["#06121f", "#123150"] },
  { id: "forest", label: "Forest", swatch: ["#07130d", "#16352a"] },
  { id: "sunset", label: "Sunset", swatch: ["#170b0b", "#3d1d17"] },
  { id: "grape", label: "Grape", swatch: ["#120a1c", "#2e1a48"] },
  { id: "rose", label: "Rose", swatch: ["#1a0a12", "#45182e"] },
  { id: "slate", label: "Slate", swatch: ["#0f141a", "#263241"] },
  { id: "mocha", label: "Mocha", swatch: ["#16110d", "#3a2c22"] },
  { id: "light", label: "Light", swatch: ["#f4f5f8", "#dcdfe6"], light: true },
  { id: "mint", label: "Mint (light)", swatch: ["#eef8f3", "#c7e8d8"], light: true },
  { id: "paper", label: "Paper (light)", swatch: ["#f7f3ea", "#e4dccb"], light: true },
  { id: "retro", label: "Retro 95", swatch: ["#008080", "#c0c0c0"], light: true },
  { id: "terminal", label: "Terminal", swatch: ["#000", "#00ff66"] },
  { id: "neon", label: "Neon", swatch: ["#0a0014", "#ff00e6"], secret: "Try a famous old cheat code…" },
  { id: "gold", label: "Gold", swatch: ["#120e02", "#d4a017"], secret: "Be very persistent with the logo…" },
  { id: "galaxy", label: "Galaxy", swatch: ["#030016", "#3b2a8f"], secret: "Find all the hidden eggs…" },
];
export const isLightPalette = (p: Palette) => !!PALETTES.find((x) => x.id === p)?.light;

export type Font = "inter" | "system" | "rounded" | "mono" | "readable" | "dyslexic";
export const FONTS: { id: Font; label: string; family: string; google?: string }[] = [
  { id: "inter", label: "Inter (default)", family: "var(--font-inter,'Inter'),system-ui,sans-serif" },
  { id: "system", label: "Your device's font", family: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" },
  { id: "rounded", label: "Rounded", family: "'Nunito',system-ui,sans-serif", google: "Nunito:wght@300;400;600;700;800" },
  { id: "mono", label: "Monospace", family: "'JetBrains Mono',ui-monospace,Consolas,monospace", google: "JetBrains+Mono:wght@300;400;600;700" },
  { id: "readable", label: "Extra readable", family: "'Atkinson Hyperlegible',system-ui,sans-serif", google: "Atkinson+Hyperlegible:wght@400;700" },
  { id: "dyslexic", label: "Dyslexia-friendly", family: "'Lexend',system-ui,sans-serif", google: "Lexend:wght@300;400;600;700" },
];

export type Section = "today" | "polls" | "quick";
export const SECTIONS: { id: Section; label: string }[] = [
  { id: "today", label: "Today strip" },
  { id: "polls", label: "Polls" },
  { id: "quick", label: "Recent / starred lists" },
];
export const HIDEABLE: { id: string; label: string }[] = [
  ...SECTIONS,
  { id: "stats", label: "Stats under the title" },
  { id: "chat", label: "Chat button" },
  { id: "community", label: "Community & spin buttons" },
  { id: "pet", label: "Site pet" },
];

export interface Look {
  palette: Palette;
  accent: string;
  density: "comfy" | "compact" | "large";
  motion: boolean;
  newTab: boolean;
  /** show each site's description under its name */
  descriptions: boolean;
  /** tint each card with the main colour of the site's icon */
  iconTint: boolean;
  /** show "Recently added", "Most popular" and "Top rated" as folders */
  specialFolders: boolean;
  /** skip folders with nothing in them */
  hideEmpty: boolean;
  // text
  font: Font;
  fontScale: number;
  weight: "light" | "normal" | "bold";
  lineHeight: number;
  // shape & layout
  radius: number;
  cardStyle: "flat" | "outlined" | "glass";
  hover: "none" | "lift" | "glow";
  iconGrid: boolean;
  folderHeader: "plain" | "tinted" | "banner" | "underline";
  folderBorders: boolean;
  width: "narrow" | "normal" | "wide" | "full";
  smallHeader: boolean;
  sideNav: boolean;
  hide: string[];
  order: Section[];
  // effects
  bg: "none" | "dots" | "grid" | "gradient" | "aurora" | "stripes";
  animatedBg: boolean;
  gradientTitle: boolean;
  glow: boolean;
  sparkles: boolean;
  seasonal: boolean;
  snow: boolean;
  greeting: boolean;
  minimal: boolean;
  iconStyle: "line" | "emoji";
  emojiFont: "device" | "noto";
  // when to go dark
  autoDark: "off" | "time" | "system";
  // accessibility
  highContrast: boolean;
  colorblind: boolean;
  underline: boolean;
  /** bigger tap targets */
  bigButtons: boolean;
  /** little buzzes on phones */
  haptics: boolean;
  /** ask before opening websites that aren't on the shared list */
  leaveWarn: boolean;
  /** interface language */
  lang: "auto" | "en" | "es";
}
export const DEFAULT_ORDER: Section[] = ["today", "polls", "quick"];
export const DEFAULT_LOOK: Look = {
  palette: "black", accent: "", density: "comfy", motion: true, newTab: true, descriptions: false, iconTint: false, specialFolders: false, hideEmpty: false,
  font: "inter", fontScale: 1, weight: "normal", lineHeight: 1.5,
  radius: 14, cardStyle: "outlined", hover: "none", iconGrid: false, folderHeader: "plain", folderBorders: false, width: "normal", smallHeader: false, sideNav: false,
  hide: [], order: DEFAULT_ORDER,
  bg: "none", animatedBg: false, gradientTitle: false, glow: false, sparkles: false, seasonal: true, snow: true, greeting: true, minimal: false,
  iconStyle: "line", emojiFont: "device",
  autoDark: "off",
  highContrast: false, colorblind: false, underline: false, bigButtons: false, haptics: true, leaveWarn: false, lang: "auto",
};

/** Only keep values that make sense (old saved looks, pasted theme codes, synced settings). */
export function cleanLook(raw: Partial<Look> | null | undefined): Look {
  const r = (raw || {}) as Record<string, unknown>;
  const out: Look = { ...DEFAULT_LOOK };
  const pick = <K extends keyof Look>(k: K, ok: (v: unknown) => boolean) => { if (ok(r[k])) (out as unknown as Record<string, unknown>)[k] = r[k]; };
  const oneOf = (list: readonly unknown[]) => (v: unknown) => list.includes(v);
  const bool = (v: unknown) => typeof v === "boolean";
  const num = (min: number, max: number) => (v: unknown) => typeof v === "number" && v >= min && v <= max;
  pick("palette", oneOf(PALETTES.map((p) => p.id)));
  pick("accent", (v) => typeof v === "string" && (v === "" || /^#[0-9a-f]{6}$/i.test(v)));
  pick("density", oneOf(["comfy", "compact", "large"]));
  for (const k of ["motion", "newTab", "descriptions", "iconTint", "specialFolders", "hideEmpty", "iconGrid", "folderBorders", "smallHeader", "sideNav",
    "animatedBg", "gradientTitle", "glow", "sparkles", "seasonal", "snow", "greeting", "minimal", "highContrast", "colorblind", "underline",
    "bigButtons", "haptics", "leaveWarn"] as const) pick(k, bool);
  pick("lang", oneOf(["auto", "en", "es"]));
  pick("font", oneOf(FONTS.map((f) => f.id)));
  pick("fontScale", num(0.8, 1.4));
  pick("weight", oneOf(["light", "normal", "bold"]));
  pick("lineHeight", num(1.2, 2));
  pick("radius", num(0, 28));
  pick("cardStyle", oneOf(["flat", "outlined", "glass"]));
  pick("hover", oneOf(["none", "lift", "glow"]));
  pick("folderHeader", oneOf(["plain", "tinted", "banner", "underline"]));
  pick("width", oneOf(["narrow", "normal", "wide", "full"]));
  pick("bg", oneOf(["none", "dots", "grid", "gradient", "aurora", "stripes"]));
  pick("iconStyle", oneOf(["line", "emoji"]));
  pick("emojiFont", oneOf(["device", "noto"]));
  pick("autoDark", oneOf(["off", "time", "system"]));
  if (Array.isArray(r.hide)) out.hide = (r.hide as unknown[]).filter((x): x is string => typeof x === "string" && HIDEABLE.some((h) => h.id === x));
  if (Array.isArray(r.order)) {
    const order = (r.order as unknown[]).filter((x): x is Section => SECTIONS.some((s) => s.id === x));
    if (order.length === DEFAULT_ORDER.length && new Set(order).size === order.length) out.order = order;
  }
  return out;
}

/* ---------- share a theme as a code ---------- */
const SHARE_KEYS: (keyof Look)[] = ["palette", "accent", "font", "fontScale", "weight", "lineHeight", "radius", "cardStyle", "hover", "folderHeader",
  "folderBorders", "bg", "animatedBg", "gradientTitle", "glow", "minimal", "iconStyle", "width", "density"];
export function encodeTheme(look: Look): string {
  const o: Record<string, unknown> = {};
  for (const k of SHARE_KEYS) if (JSON.stringify(look[k]) !== JSON.stringify(DEFAULT_LOOK[k])) o[k] = look[k];
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `TB1.${b64}`;
}
/** Read a theme code; returns only the theme parts (null if it isn't a valid code). */
export function decodeTheme(code: string): Partial<Look> | null {
  const m = /^TB1\.([A-Za-z0-9_-]{2,600})$/.exec(code.trim());
  if (!m) return null;
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")))));
    if (!json || typeof json !== "object") return null;
    const clean = cleanLook(json);
    const out: Partial<Look> = {};
    for (const k of SHARE_KEYS) (out as Record<string, unknown>)[k] = clean[k];
    return out;
  } catch {
    return null;
  }
}

/* ---------- seasons, holidays and the time of day ---------- */
export type Season = "" | "halloween" | "winter" | "valentine" | "spring" | "summer" | "newyear";
export function seasonFor(d = new Date()): Season {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 1 && day <= 2) return "newyear";
  if (m === 10 && day >= 20) return "halloween";
  if (m === 12) return "winter";
  if (m === 2 && day >= 10 && day <= 15) return "valentine";
  if ((m === 3 && day >= 20) || (m === 4 && day <= 20)) return "spring";
  if (m === 7 || m === 8) return "summer";
  return "";
}
const SEASON_ACCENT: Record<Season, string> = { "": "", halloween: "#ff8a3d", winter: "#6cc4ff", valentine: "#ff6fa5", spring: "#7ad67a", summer: "#ffc94d", newyear: "#ffd166" };
/** The logo for the day: holidays (and the site's birthday) get their own. */
export function holidayLogo(d = new Date(), siteBirthday?: string): { mark: string; label: string } {
  const m = d.getMonth() + 1, day = d.getDate();
  if (siteBirthday && /^\d{4}-(\d{2})-(\d{2})$/.test(siteBirthday)) {
    const [, bm, bd] = /^\d{4}-(\d{2})-(\d{2})$/.exec(siteBirthday)!;
    if (Number(bm) === m && Number(bd) === day) return { mark: "🎂", label: "It's the site's birthday!" };
  }
  if (m === 1 && day <= 2) return { mark: "🎆", label: "Happy New Year!" };
  if (m === 2 && day === 14) return { mark: "💘", label: "Happy Valentine's Day" };
  if (m === 3 && day === 17) return { mark: "☘️", label: "Happy St Patrick's Day" };
  if (m === 4 && day === 1) return { mark: "🤡", label: "April Fools!" };
  if (m === 10 && day >= 24) return { mark: "🎃", label: "Happy Halloween" };
  if (m === 12 && day >= 18 && day <= 26) return { mark: "🎄", label: "Merry Christmas" };
  if (m === 12 && day === 31) return { mark: "🥳", label: "Happy New Year's Eve" };
  return { mark: "🔖", label: "Back to top" };
}
export function greetingFor(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Good night";
}

/** The palette actually shown right now (auto dark by time or by your device). */
export function effectivePalette(look: Look, prefersDark: boolean, now = new Date()): Palette {
  const dark = isLightPalette(look.palette) ? "black" : look.palette;
  const light = isLightPalette(look.palette) ? look.palette : "light";
  if (look.autoDark === "time") { const h = now.getHours(); return h >= 7 && h < 19 ? light : dark; }
  if (look.autoDark === "system") return prefersDark ? dark : light;
  return look.palette;
}

/* ---------- fonts load only when someone picks them ---------- */
function ensureFont(google?: string, id = "font") {
  if (!google) return;
  const href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
  const elId = `gf-${id}`;
  const existing = document.getElementById(elId) as HTMLLinkElement | null;
  if (existing) { if (existing.href !== href) existing.href = href; return; }
  const link = document.createElement("link");
  link.id = elId;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export interface LookContext { prefersDark: boolean; reduceMotion: boolean; seasonAccentAllowed?: boolean }
export function applyLook(look: Look, ctx: LookContext = { prefersDark: true, reduceMotion: false }) {
  const root = document.documentElement;
  const palette = effectivePalette(look, ctx.prefersDark);
  const season = look.seasonal ? seasonFor() : "";
  const set = (k: string, v: string | boolean) => root.setAttribute(`data-${k}`, typeof v === "boolean" ? (v ? "on" : "off") : v);
  set("theme", isLightPalette(palette) ? "light" : "dark");
  set("palette", palette);
  set("density", look.density);
  set("motion", look.motion && !ctx.reduceMotion);
  set("font", look.font);
  set("weight", look.weight);
  set("cards", look.cardStyle);
  set("hover", look.hover);
  set("icongrid", look.iconGrid);
  set("fh", look.folderHeader);
  set("folderborders", look.folderBorders);
  set("width", look.width);
  set("smallheader", look.smallHeader);
  set("bg", look.bg);
  set("animbg", look.animatedBg && look.motion && !ctx.reduceMotion);
  set("gradtitle", look.gradientTitle);
  set("glow", look.glow);
  set("minimal", look.minimal);
  set("emoji", look.emojiFont);
  set("contrast", look.highContrast);
  set("cb", look.colorblind);
  set("underline", look.underline);
  set("season", season || "none");
  set("sidenav", look.sideNav);
  set("hide", look.hide.join(" ") || "none");
  set("bigtap", look.bigButtons);
  // language: "auto" follows the device
  set("lang", look.lang === "auto" ? (navigator.language?.toLowerCase().startsWith("es") ? "es" : "en") : look.lang);
  set("haptics", look.haptics);
  const style = root.style;
  style.setProperty("--fs-scale", String(look.fontScale));
  style.setProperty("--lh", String(look.lineHeight));
  style.setProperty("--radius", `${look.radius}px`);
  style.setProperty("--radius-sm", `${Math.round(look.radius * 0.72)}px`);
  style.setProperty("--radius-card", `${Math.round(look.radius * 0.8)}px`);
  const font = FONTS.find((f) => f.id === look.font) || FONTS[0];
  style.setProperty("--font", font.family);
  ensureFont(font.google, "text");
  if (look.emojiFont === "noto") ensureFont("Noto+Color+Emoji", "emoji");
  // the novelty themes keep their own colours; others pick up the season's accent
  const special = ["retro", "terminal", "neon", "gold", "galaxy"].includes(palette);
  const accent = look.accent || (season && !special ? SEASON_ACCENT[season] : "");
  if (accent) {
    style.setProperty("--accent", accent);
    style.setProperty("--accent-dim", `${accent}26`);
  } else {
    style.removeProperty("--accent");
    style.removeProperty("--accent-dim");
  }
  // the phone's status bar takes the theme's background colour
  requestAnimationFrame(() => {
    const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (!bg) return;
    let metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    if (!metas.length) {
      const m = document.createElement("meta");
      m.name = "theme-color";
      document.head.appendChild(m);
      metas = [m];
    }
    metas.forEach((m) => { m.content = bg; m.removeAttribute("media"); });
  });
}
