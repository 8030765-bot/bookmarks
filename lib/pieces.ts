/**
 * The design builder's parts: every piece you can drag onto the canvas,
 * where it sits in the parts library, its starting size and the options
 * it has. Shared by the builder, the home page (which draws them) and the
 * server (which checks saved designs).
 *
 * The canvas is a grid COLS wide (it stretches to the screen) and made of
 * ROW-pixel rows. Pieces snap to it, or sit anywhere when you hold Ctrl.
 */
export const COLS = 24;
export const ROW = 16;

export type PropType = "text" | "longtext" | "number" | "select" | "color" | "bool" | "folder" | "url" | "emoji" | "date" | "time" | "action";
export type PropValue = string | number | boolean;
export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  def: PropValue;
  options?: [string, string][];
  min?: number;
  max?: number;
  hint?: string;
  /** only show this option when another one has this value */
  when?: [string, PropValue[]];
}

export interface PieceStyle {
  bg?: string;
  text?: string;
  accent?: string;
  glass?: boolean;
  opacity?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: "none" | "soft" | "strong" | "glow";
  pad?: number;
  font?: string;
  /** text size in % (scales the whole piece) */
  size?: number;
  /** on phones (pieces stack top to bottom) */
  phone?: "show" | "hide";
}

export interface DesignPiece {
  id: string;
  /** which part this is (see PIECES) */
  part: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked?: boolean;
  hidden?: boolean;
  style?: PieceStyle;
  props?: Record<string, PropValue>;
}

export interface DesignCanvas {
  bg: string;
  /** a background picture (https) or "" */
  bgImage?: string;
  bgPattern?: "none" | "dots" | "grid" | "gradient" | "aurora" | "stripes";
  text: string;
  accent: string;
  font: string;
  /** "dark" or "light": which way the site's cards and buttons lean */
  tone: "dark" | "light";
  /** minimum page height in rows */
  rows: number;
}

export interface BuiltDesign {
  id: string;
  name: string;
  emoji: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  /** shared to the gallery: "pending" until a moderator checks it */
  gallery?: "pending" | "approved";
  uses?: number;
  canvas: DesignCanvas;
  pieces: DesignPiece[];
}

export const DEFAULT_CANVAS: DesignCanvas = { bg: "#0f1115", bgImage: "", bgPattern: "none", text: "#e9ecf2", accent: "#7c6cff", font: "inter", tone: "dark", rows: 60 };

/** Fonts a design (or one piece) can use. Google ones load only when picked. */
export const FONT_CHOICES: { id: string; label: string; family: string; google?: string }[] = [
  { id: "inter", label: "Inter", family: "var(--font-inter,'Inter'),system-ui,sans-serif" },
  { id: "system", label: "Device font", family: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" },
  { id: "jakarta", label: "Plus Jakarta (Nova)", family: "'Plus Jakarta Sans',system-ui,sans-serif", google: "Plus+Jakarta+Sans:wght@400;500;600;700;800" },
  { id: "nunito", label: "Nunito (rounded)", family: "'Nunito',system-ui,sans-serif", google: "Nunito:wght@400;600;700;800" },
  { id: "poppins", label: "Poppins", family: "'Poppins',system-ui,sans-serif", google: "Poppins:wght@400;500;600;700;800" },
  { id: "grotesk", label: "Space Grotesk", family: "'Space Grotesk',system-ui,sans-serif", google: "Space+Grotesk:wght@400;500;600;700" },
  { id: "fraunces", label: "Fraunces (Journal)", family: "'Fraunces',Georgia,serif", google: "Fraunces:opsz,wght@9..144,400..900" },
  { id: "newsreader", label: "Newsreader", family: "'Newsreader',Georgia,serif", google: "Newsreader:opsz,wght@6..72,400..700" },
  { id: "serif", label: "Instrument Serif (Zen)", family: "'Instrument Serif',Georgia,serif", google: "Instrument+Serif:ital@0;1" },
  { id: "mono", label: "JetBrains Mono (Terminal)", family: "'JetBrains Mono',ui-monospace,Consolas,monospace", google: "JetBrains+Mono:wght@400;600;700;800" },
  { id: "pixel", label: "VT323 (pixel)", family: "'VT323',ui-monospace,monospace", google: "VT323" },
  { id: "lexend", label: "Lexend (easy to read)", family: "'Lexend',system-ui,sans-serif", google: "Lexend:wght@300;400;600;700" },
  { id: "comic", label: "Comic Neue", family: "'Comic Neue','Comic Sans MS',cursive", google: "Comic+Neue:wght@400;700" },
  { id: "bebas", label: "Bebas Neue (headlines)", family: "'Bebas Neue',Impact,sans-serif", google: "Bebas+Neue" },
];

/** What a programmable button can do. */
export const BUTTON_ACTIONS: [string, string][] = [
  ["url", "Open a website"],
  ["folder", "Open a folder"],
  ["search", "Search for something"],
  ["section", "Go to a page (Home, Starred…)"],
  ["chat", "Open chat"],
  ["add", "Add a website"],
  ["newFolder", "Make a folder"],
  ["customize", "Customize the look"],
  ["theme", "Switch light / dark"],
  ["tools", "Open the tools"],
  ["spin", "Spin the wheel"],
  ["community", "Community & leaderboard"],
  ["palette", "Command menu (Ctrl K)"],
  ["random", "Open a random website"],
  ["top", "Scroll to the top"],
  ["foldAll", "Fold / unfold every folder"],
  ["design", "Switch to another design"],
  ["builder", "Open the design builder"],
  ["profile", "My profile"],
  ["help", "Help page"],
  ["copy", "Copy some text"],
];
export const SECTIONS_TO: [string, string][] = [["home", "Home"], ["starred", "Starred"], ["later", "Read later"], ["recent", "Recently opened"], ["mystuff", "My Stuff"]];
export const BUILT_IN_DESIGNS: [string, string][] = [["classic", "Classic"], ["nova", "Nova"], ["orbit", "Orbit"], ["board", "Board"], ["desk", "Desk"], ["journal", "Journal"], ["terminal", "Terminal"], ["zen", "Zen"]];

export const BUTTON_VARIANTS: [string, string][] = [
  ["filled", "Filled"], ["soft", "Soft"], ["outline", "Outline"], ["ghost", "Just text"], ["icon", "Round icon"], ["dock", "Dock icon"], ["pill", "Pill"], ["terminal", "[terminal]"],
];

export interface PartDef {
  /** the id saved in designs */
  id: string;
  name: string;
  emoji: string;
  /** where it sits in the parts library, e.g. "Design pieces/Orbit" */
  folder: string;
  blurb: string;
  w: number;
  h: number;
  /** which built-in design's styling it brings along */
  design?: string;
  /** decoration: hidden on phones unless you say otherwise */
  deco?: boolean;
  /** buttons and menus: they can open past their box */
  overflow?: boolean;
  /** contains things that would normally stick to the screen */
  contain?: boolean;
  props?: PropDef[];
  style?: PieceStyle;
}

const size = (def = "m"): PropDef => ({ key: "size", label: "Size", type: "select", def, options: [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Huge"]] });
const align = (def = "left"): PropDef => ({ key: "align", label: "Line up", type: "select", def, options: [["left", "Left"], ["center", "Middle"], ["right", "Right"]] });
const viewProp: PropDef = { key: "view", label: "Show websites as", type: "select", def: "auto", options: [["auto", "My choice (grid/list switch)"], ["grid", "Tiles"], ["list", "List"]] };
const listStyle: PropDef = { key: "style", label: "Style", type: "select", def: "chips", options: [["chips", "Chips"], ["tiles", "Tiles"], ["list", "List"], ["dock", "Dock icons"]] };
const max = (def: number): PropDef => ({ key: "max", label: "How many", type: "number", def, min: 1, max: 30 });

/** A ready-made button: really a programmable button with its settings filled in. */
function btn(id: string, name: string, emoji: string, action: string, value = "", extra: Partial<PartDef> = {}): PartDef {
  return {
    id, name, emoji, folder: "Functions & buttons", blurb: `A button: ${name.toLowerCase()}. You can change what it does.`, w: 4, h: 3, overflow: true,
    props: buttonProps({ label: name, icon: emoji, action, value }), ...extra,
  };
}
export function buttonProps(d: { label: string; icon: string; action: string; value?: string; variant?: string }): PropDef[] {
  return [
    { key: "label", label: "Text", type: "text", def: d.label },
    { key: "icon", label: "Icon (emoji)", type: "emoji", def: d.icon },
    { key: "action", label: "When pressed", type: "action", def: d.action, options: BUTTON_ACTIONS },
    { key: "value", label: "Website / search / text", type: "text", def: d.action === "section" ? "" : d.value || "", when: ["action", ["url", "search", "copy"]] },
    { key: "folder", label: "Folder", type: "folder", def: "", when: ["action", ["folder"]] },
    { key: "section", label: "Page", type: "select", def: d.action === "section" && d.value ? d.value : "home", options: SECTIONS_TO, when: ["action", ["section"]] },
    { key: "design", label: "Design", type: "select", def: "classic", options: BUILT_IN_DESIGNS, when: ["action", ["design"]] },
    { key: "newTab", label: "Open in a new tab", type: "bool", def: true, when: ["action", ["url"]] },
    { key: "variant", label: "Look", type: "select", def: d.variant || "soft", options: BUTTON_VARIANTS },
    { key: "showLabel", label: "Show the text", type: "bool", def: true },
    { key: "tooltip", label: "Tooltip", type: "text", def: "" },
  ];
}

const viewer = (id: string, name: string, emoji: string, folder: string, look: string, mode: string, design?: string, w = 24, h = 40): PartDef => ({
  id, name, emoji, folder, design, w, h, contain: false,
  blurb: "Shows the folder (or Starred, search results…) you open. On its own spot, or as a pop-up window.",
  props: [
    { key: "look", label: "Look", type: "select", def: look, options: [["plain", "Plain"], ["nova", "Nova banner"], ["orbit", "Orbit window"], ["journal", "Journal section"], ["terminal", "Terminal folder"]] },
    { key: "mode", label: "Where it shows", type: "select", def: mode, options: [["popup", "A pop-up window"], ["inline", "In this box"]] },
    { key: "empty", label: "When nothing is open (in this box)", type: "select", def: "folders", options: [["folders", "Show every folder"], ["hint", "Say \"pick a folder\""], ["blank", "Nothing"]], when: ["mode", ["inline"]] },
  ],
});

export const PARTS: PartDef[] = [
  /* ---------- basic blocks ---------- */
  { id: "topbar", name: "Top bar", emoji: "🧭", folder: "Basic blocks", blurb: "The whole top bar: logo, search, buttons and your profile.", w: 24, h: 4, overflow: true },
  { id: "search", name: "Search bar", emoji: "🔍", folder: "Basic blocks", blurb: "Search every website.", w: 10, h: 4, overflow: true, props: [{ key: "placeholder", label: "Placeholder", type: "text", def: "" }, { key: "big", label: "Big", type: "bool", def: false }] },
  { id: "title", name: "Site title", emoji: "🏷️", folder: "Basic blocks", blurb: "The site's name.", w: 12, h: 5, props: [size("l"), align(), { key: "gradient", label: "Rainbow text", type: "bool", def: false }] },
  { id: "subtitle", name: "Subtitle", emoji: "💬", folder: "Basic blocks", blurb: "The line under the title.", w: 12, h: 3, props: [align()] },
  { id: "greeting", name: "Greeting", emoji: "👋", folder: "Basic blocks", blurb: "Good morning, (your name)!", w: 12, h: 4, props: [size("m"), align(), { key: "wave", label: "Wave emoji", type: "bool", def: true }] },
  { id: "stats", name: "Stats", emoji: "📊", folder: "Basic blocks", blurb: "Who's online, websites, folders and visits.", w: 12, h: 3 },
  { id: "folders", name: "All folders", emoji: "🗂️", folder: "Basic blocks", blurb: "Every folder and its websites (search filters it).", w: 24, h: 40, props: [viewProp, { key: "cols", label: "Columns", type: "select", def: "auto", options: [["auto", "Fit the space"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]] }] },
  { id: "folder", name: "One folder", emoji: "📁", folder: "Basic blocks", blurb: "Just one folder you pick.", w: 8, h: 20, props: [{ key: "folder", label: "Folder", type: "folder", def: "" }, viewProp] },
  { id: "apps", name: "Folder apps", emoji: "📱", folder: "Basic blocks", blurb: "A folder icon for each folder, like a phone. Opens the folder.", w: 12, h: 14, props: [size("m"), { key: "labels", label: "Names under icons", type: "bool", def: true }] },
  { id: "chips", name: "Jump-to chips", emoji: "🔖", folder: "Basic blocks", blurb: "A row of folder chips that jump to (or open) a folder.", w: 24, h: 4 },
  { id: "starred", name: "Starred", emoji: "⭐", folder: "Basic blocks", blurb: "Websites you starred.", w: 12, h: 6, props: [listStyle, max(12)] },
  { id: "later", name: "Read later", emoji: "🕐", folder: "Basic blocks", blurb: "Websites saved for later.", w: 12, h: 6, props: [listStyle, max(12)] },
  { id: "recent", name: "Recently opened", emoji: "📈", folder: "Basic blocks", blurb: "The websites you opened last.", w: 12, h: 6, props: [listStyle, max(8)] },
  { id: "quick", name: "Quick lists", emoji: "⚡", folder: "Basic blocks", blurb: "Recent, starred, top rated and more, in tabs.", w: 24, h: 9 },
  { id: "today", name: "Today", emoji: "📅", folder: "Basic blocks", blurb: "The Today strip: website of the day, events, challenge.", w: 24, h: 10 },
  { id: "polls", name: "Polls", emoji: "🗳️", folder: "Basic blocks", blurb: "The site's polls.", w: 12, h: 12 },
  { id: "banners", name: "Announcements", emoji: "📣", folder: "Basic blocks", blurb: "The admins' announcement and other notices (hides when there are none).", w: 24, h: 4 },
  { id: "start", name: "Start here", emoji: "🧭", folder: "Basic blocks", blurb: "\"New here? Start with…\" for first-timers.", w: 24, h: 3 },
  { id: "results", name: "Search results bar", emoji: "🔎", folder: "Basic blocks", blurb: "How many matches, sort, and clear (only while searching).", w: 24, h: 4 },
  viewer("viewer", "Folder viewer", "🪟", "Basic blocks", "plain", "popup"),
  { id: "actions", name: "Action row", emoji: "🎛️", folder: "Basic blocks", blurb: "Add website, new folder, tags, sort and grid/list.", w: 24, h: 4, overflow: true },
  { id: "link", name: "One website", emoji: "🔗", folder: "Basic blocks", blurb: "A single website as a big tile.", w: 4, h: 6, props: [{ key: "q", label: "Website (name or address)", type: "text", def: "" }, { key: "showName", label: "Show the name", type: "bool", def: true }] },
  { id: "chatpreview", name: "Chat preview", emoji: "💬", folder: "Basic blocks", blurb: "The latest messages from the class chat. Click to open chat.", w: 8, h: 14, props: [max(6)] },
  { id: "heading", name: "Heading", emoji: "🔠", folder: "Basic blocks", blurb: "A big line of text.", w: 10, h: 4, props: [{ key: "text", label: "Text", type: "text", def: "My bookmarks" }, size("l"), align()] },
  { id: "text", name: "Text", emoji: "📝", folder: "Basic blocks", blurb: "A paragraph of your own words (**bold** and links work).", w: 8, h: 6, props: [{ key: "text", label: "Text", type: "longtext", def: "Write anything here." }, size("m"), align()] },
  { id: "image", name: "Picture", emoji: "🖼️", folder: "Basic blocks", blurb: "A picture from a web address (https).", w: 6, h: 8, props: [{ key: "src", label: "Picture address", type: "url", def: "" }, { key: "fit", label: "Fit", type: "select", def: "cover", options: [["cover", "Fill the box"], ["contain", "Show it all"]] }, { key: "alt", label: "Describe it", type: "text", def: "" }] },
  { id: "footer", name: "Footer", emoji: "🦶", folder: "Basic blocks", blurb: "The links at the bottom of the page.", w: 24, h: 5 },

  /* ---------- widgets ---------- */
  { id: "clock", name: "Clock", emoji: "⏰", folder: "Widgets", blurb: "A big digital clock.", w: 8, h: 6, props: [size("l"), align("center"), { key: "seconds", label: "Seconds", type: "bool", def: false }, { key: "h24", label: "24-hour", type: "bool", def: false }, { key: "date", label: "Date under it", type: "bool", def: true }] },
  { id: "analog", name: "Analog clock", emoji: "🕰️", folder: "Widgets", blurb: "A round clock with hands.", w: 5, h: 10, props: [{ key: "seconds", label: "Second hand", type: "bool", def: true }, { key: "numbers", label: "Numbers", type: "bool", def: false }] },
  { id: "date", name: "Date", emoji: "📆", folder: "Widgets", blurb: "Today's date.", w: 6, h: 3, props: [size("m"), align(), { key: "format", label: "Format", type: "select", def: "long", options: [["long", "Monday 6 October"], ["short", "6 Oct"], ["day", "Monday"]] }] },
  { id: "calendar", name: "Calendar", emoji: "🗓️", folder: "Widgets", blurb: "This month, with today and the site's events marked.", w: 6, h: 15 },
  { id: "events", name: "Upcoming events", emoji: "🎉", folder: "Widgets", blurb: "The next events from the community calendar.", w: 8, h: 10, props: [max(4)] },
  { id: "countdown", name: "Countdown", emoji: "⏳", folder: "Widgets", blurb: "Days until something (holidays, a test…).", w: 6, h: 6, props: [{ key: "title", label: "What", type: "text", def: "Summer holidays" }, { key: "date", label: "When", type: "date", def: "" }] },
  { id: "pomodoro", name: "Focus timer", emoji: "🍅", folder: "Widgets", blurb: "Work, then take a break (Pomodoro).", w: 6, h: 9, props: [{ key: "work", label: "Work minutes", type: "number", def: 25, min: 1, max: 120 }, { key: "rest", label: "Break minutes", type: "number", def: 5, min: 1, max: 60 }] },
  { id: "stopwatch", name: "Stopwatch", emoji: "⏱️", folder: "Widgets", blurb: "Start, stop, reset.", w: 5, h: 6 },
  { id: "dayprogress", name: "School day", emoji: "🏫", folder: "Widgets", blurb: "How much of the school day is done.", w: 8, h: 4, props: [{ key: "from", label: "Starts", type: "time", def: "08:30" }, { key: "to", label: "Ends", type: "time", def: "15:10" }, { key: "label", label: "Name", type: "text", def: "School day" }] },
  { id: "note", name: "Sticky note", emoji: "🗒️", folder: "Widgets", blurb: "Your own note, kept on this device.", w: 6, h: 8, style: { bg: "#ffe66d", text: "#3a3000", radius: 4, shadow: "soft" } },
  { id: "todo", name: "To-do list", emoji: "✅", folder: "Widgets", blurb: "A checklist kept on this device.", w: 6, h: 12, props: [{ key: "title", label: "Title", type: "text", def: "To do" }] },
  { id: "online", name: "Online now", emoji: "🟢", folder: "Widgets", blurb: "How many people are on the site right now.", w: 5, h: 3 },
  { id: "random", name: "Random website", emoji: "🎲", folder: "Widgets", blurb: "A random website from the list, with a reroll button.", w: 6, h: 7 },
  { id: "quote", name: "Saying of the day", emoji: "💡", folder: "Widgets", blurb: "A short motivating line that changes each day.", w: 10, h: 5, props: [align("center")] },
  { id: "spotlight", name: "Spotlight", emoji: "🔦", folder: "Widgets", blurb: "The website of the day the admins picked (or the most liked).", w: 8, h: 7 },

  /* ---------- shapes & decoration ---------- */
  { id: "box", name: "Box", emoji: "⬛", folder: "Shapes & decoration", blurb: "A plain box to put things on.", w: 8, h: 8, deco: true, style: { bg: "#1c2030", radius: 16 } },
  { id: "glass", name: "Glass panel", emoji: "🪟", folder: "Shapes & decoration", blurb: "A see-through frosted box.", w: 10, h: 10, deco: true, style: { glass: true, radius: 22, borderWidth: 1, borderColor: "#ffffff33" } },
  { id: "circle", name: "Circle", emoji: "⚪", folder: "Shapes & decoration", blurb: "A round shape.", w: 4, h: 6, deco: true, style: { bg: "#7c6cff", radius: 999 } },
  { id: "line", name: "Line", emoji: "➖", folder: "Shapes & decoration", blurb: "A straight line.", w: 12, h: 1, deco: true, props: [{ key: "dir", label: "Direction", type: "select", def: "h", options: [["h", "Across"], ["v", "Up and down"]] }, { key: "thick", label: "Thickness", type: "number", def: 2, min: 1, max: 16 }, { key: "dashed", label: "Dashed", type: "bool", def: false }], style: { text: "#ffffff40" } },
  { id: "divider", name: "Divider with text", emoji: "〰️", folder: "Shapes & decoration", blurb: "A line with a label in the middle.", w: 24, h: 2, props: [{ key: "text", label: "Text", type: "text", def: "More" }] },
  { id: "blob", name: "Gradient blob", emoji: "🫧", folder: "Shapes & decoration", blurb: "A soft glowing colour blob for the background.", w: 10, h: 14, deco: true, props: [{ key: "a", label: "Colour 1", type: "color", def: "#7c6cff" }, { key: "b", label: "Colour 2", type: "color", def: "#ff5c9a" }, { key: "blur", label: "Blur", type: "number", def: 40, min: 0, max: 120 }] },
  { id: "gradient", name: "Gradient box", emoji: "🌈", folder: "Shapes & decoration", blurb: "A box that fades between two colours.", w: 10, h: 8, deco: true, props: [{ key: "a", label: "Colour 1", type: "color", def: "#4dabff" }, { key: "b", label: "Colour 2", type: "color", def: "#3dd68c" }, { key: "angle", label: "Angle", type: "number", def: 135, min: 0, max: 360 }], style: { radius: 18 } },
  { id: "pattern", name: "Pattern", emoji: "🔳", folder: "Shapes & decoration", blurb: "Dots, a grid or stripes.", w: 10, h: 10, deco: true, props: [{ key: "kind", label: "Pattern", type: "select", def: "dots", options: [["dots", "Dots"], ["grid", "Grid"], ["stripes", "Stripes"], ["checks", "Checks"]] }, { key: "color", label: "Colour", type: "color", def: "#ffffff22" }, { key: "gap", label: "Spacing", type: "number", def: 18, min: 6, max: 80 }] },
  { id: "sticker", name: "Emoji sticker", emoji: "😎", folder: "Shapes & decoration", blurb: "A big emoji. Tilt it for fun.", w: 3, h: 5, deco: true, props: [{ key: "emoji", label: "Emoji", type: "emoji", def: "⭐" }, { key: "tilt", label: "Tilt", type: "number", def: -8, min: -180, max: 180 }] },
  { id: "bgimage", name: "Background picture", emoji: "🏞️", folder: "Shapes & decoration", blurb: "A picture filling a box, to sit behind things.", w: 24, h: 20, deco: true, props: [{ key: "src", label: "Picture address", type: "url", def: "" }, { key: "dim", label: "Darken (%)", type: "number", def: 30, min: 0, max: 90 }] },

  /* ---------- functions & buttons ---------- */
  { id: "profile", name: "Profile button", emoji: "👤", folder: "Functions & buttons", blurb: "The little circle with your first letter (or picture). Opens your menu.", w: 2, h: 3, overflow: true, props: [{ key: "showName", label: "Show my name", type: "bool", def: false }] },
  { id: "login", name: "Log in / out", emoji: "🔑", folder: "Functions & buttons", blurb: "Log in when you're out; log out when you're in.", w: 4, h: 3, overflow: true },
  { id: "bell", name: "Notifications", emoji: "🔔", folder: "Functions & buttons", blurb: "The bell with your unread count.", w: 2, h: 3, overflow: true },
  { id: "more", name: "More menu (…)", emoji: "⋯", folder: "Functions & buttons", blurb: "The ⋯ menu with everything else.", w: 2, h: 3, overflow: true },
  { id: "admin", name: "Admin button", emoji: "🛡️", folder: "Functions & buttons", blurb: "Opens the admin panel (staff only — hidden for everyone else).", w: 2, h: 3, overflow: true },
  { id: "logo", name: "Logo", emoji: "🔖", folder: "Functions & buttons", blurb: "The site's logo and name. Click for the top.", w: 6, h: 3, props: [{ key: "showName", label: "Show the name", type: "bool", def: true }] },
  { id: "sort", name: "Sort menu", emoji: "↕️", folder: "Functions & buttons", blurb: "Change how websites are sorted.", w: 5, h: 3, overflow: true },
  { id: "viewtoggle", name: "Grid / list switch", emoji: "🔲", folder: "Functions & buttons", blurb: "Switch between tiles and a list.", w: 3, h: 3 },
  { id: "themetoggle", name: "Light / dark switch", emoji: "🌗", folder: "Functions & buttons", blurb: "A sliding switch for light and dark.", w: 3, h: 3 },
  { id: "button", name: "Custom button", emoji: "🧩", folder: "Functions & buttons", blurb: "Pick its text, icon, look and what it does.", w: 5, h: 3, overflow: true, props: buttonProps({ label: "My button", icon: "✨", action: "url", value: "https://", variant: "filled" }) },
  btn("btn-add", "Add website", "➕", "add", "", { props: buttonProps({ label: "Add website", icon: "➕", action: "add", variant: "filled" }) }),
  btn("btn-folder", "New folder", "📁", "newFolder"),
  btn("btn-chat", "Chat", "💬", "chat"),
  btn("btn-customize", "Customize", "🎨", "customize"),
  btn("btn-theme", "Light / dark", "🌗", "theme"),
  btn("btn-tools", "Tools", "🧰", "tools"),
  btn("btn-spin", "Spin the wheel", "🎡", "spin"),
  btn("btn-community", "Community", "🏆", "community"),
  btn("btn-palette", "Command menu", "⌨️", "palette"),
  btn("btn-home", "Home", "🏠", "section", "home"),
  btn("btn-starred", "Starred", "⭐", "section", "starred"),
  btn("btn-later", "Read later", "🕐", "section", "later"),
  btn("btn-recent", "Recently opened", "📈", "section", "recent"),
  btn("btn-mystuff", "My Stuff", "🔒", "section", "mystuff"),
  btn("btn-random", "Random website", "🎲", "random"),
  btn("btn-top", "Back to top", "⬆️", "top"),
  btn("btn-foldall", "Fold all", "🪗", "foldAll"),
  btn("btn-builder", "Design builder", "🛠️", "builder"),
  btn("btn-help", "Help", "❓", "help"),

  /* ---------- pieces of the built-in designs ---------- */
  // Classic
  { id: "classic-hero", name: "Hero", emoji: "📄", folder: "Design pieces/Classic", design: "classic", blurb: "Classic's big title, greeting, subtitle and stats.", w: 24, h: 13 },
  { id: "classic-topbar", name: "Top bar", emoji: "🧭", folder: "Design pieces/Classic", design: "classic", blurb: "Classic's top bar.", w: 24, h: 4, overflow: true },
  { id: "classic-actions", name: "Action row", emoji: "🎛️", folder: "Design pieces/Classic", design: "classic", blurb: "Add website, new folder, sort and grid/list.", w: 24, h: 4, overflow: true },
  { id: "classic-chips", name: "Jump-to chips", emoji: "🔖", folder: "Design pieces/Classic", design: "classic", blurb: "The sticky row of folder chips.", w: 24, h: 4 },
  { id: "classic-folders", name: "Folder list", emoji: "🗂️", folder: "Design pieces/Classic", design: "classic", blurb: "Every folder on one long page.", w: 24, h: 50 },
  { id: "classic-footer", name: "Footer", emoji: "🦶", folder: "Design pieces/Classic", design: "classic", blurb: "Classic's footer.", w: 24, h: 5 },
  // Nova
  { id: "nova-sidebar", name: "Sidebar", emoji: "📚", folder: "Design pieces/Nova", design: "nova", contain: true, overflow: true, blurb: "Nova's sidebar: Home, your lists, every folder and the buttons at the bottom.", w: 5, h: 50 },
  { id: "nova-topbar", name: "Glass top bar", emoji: "🧭", folder: "Design pieces/Nova", design: "nova", blurb: "Nova's floating glass top bar.", w: 19, h: 5, overflow: true },
  { id: "nova-home", name: "Home dashboard", emoji: "✨", folder: "Design pieces/Nova", design: "nova", blurb: "Greeting, stats, recently opened and folder tiles.", w: 19, h: 45 },
  viewer("nova-page", "Folder page", "📑", "Design pieces/Nova", "nova", "inline", "nova", 19, 45),
  // Orbit
  { id: "orbit-home", name: "Clock & apps", emoji: "🪐", folder: "Design pieces/Orbit", design: "orbit", blurb: "Orbit's big clock, greeting and folder apps.", w: 24, h: 40 },
  viewer("orbit-window", "Folder window", "🪟", "Design pieces/Orbit", "orbit", "popup", "orbit", 20, 36),
  { id: "orbit-dock", name: "Dock", emoji: "⚓", folder: "Design pieces/Orbit", design: "orbit", contain: true, blurb: "Orbit's dock: Home, your lists, starred websites and buttons.", w: 14, h: 6 },
  { id: "orbit-topbar", name: "Glass top bar", emoji: "🧭", folder: "Design pieces/Orbit", design: "orbit", blurb: "Orbit's glass top bar.", w: 24, h: 5, overflow: true },
  // Board
  { id: "board-head", name: "Header", emoji: "🗂️", folder: "Design pieces/Board", design: "board", blurb: "Board's title, stats and buttons.", w: 24, h: 8, overflow: true },
  { id: "board-columns", name: "Columns", emoji: "🧱", folder: "Design pieces/Board", design: "board", blurb: "Every folder as a column you scroll across.", w: 24, h: 40 },
  // Desk
  { id: "desk-home", name: "Clock & app icons", emoji: "🖥️", folder: "Design pieces/Desk", design: "desk", blurb: "Desk's clock and folder icons (they jump to the folder).", w: 24, h: 18 },
  { id: "desk-boxes", name: "Folder boxes", emoji: "📦", folder: "Design pieces/Desk", design: "desk", blurb: "Folders as tidy boxes in a grid.", w: 24, h: 40 },
  { id: "desk-dock", name: "Dock", emoji: "⚓", folder: "Design pieces/Desk", design: "desk", contain: true, blurb: "Desk's small dock.", w: 10, h: 5 },
  // Journal
  { id: "journal-mast", name: "Masthead & sections", emoji: "📰", folder: "Design pieces/Journal", design: "journal", blurb: "The newspaper's name, date line and section links.", w: 24, h: 14 },
  { id: "journal-front", name: "Front page", emoji: "🗞️", folder: "Design pieces/Journal", design: "journal", blurb: "Top stories, sections and notices.", w: 24, h: 50 },
  viewer("journal-section", "Section page", "📑", "Design pieces/Journal", "journal", "inline", "journal", 24, 45),
  // Terminal
  { id: "term-tree", name: "Folder tree", emoji: "🌲", folder: "Design pieces/Terminal", design: "terminal", blurb: "The folder tree with commands.", w: 6, h: 45 },
  { id: "term-home", name: "Welcome screen", emoji: "💻", folder: "Design pieces/Terminal", design: "terminal", blurb: "The welcome message, folders and recent files.", w: 18, h: 40 },
  viewer("term-dir", "Directory view", "📂", "Design pieces/Terminal", "terminal", "inline", "terminal", 18, 40),
  { id: "term-prompt", name: "Prompt line", emoji: "⌨️", folder: "Design pieces/Terminal", design: "terminal", blurb: "user@site:~$ with a blinking cursor.", w: 12, h: 3, props: [{ key: "cmd", label: "Command", type: "text", def: "ls -la" }] },
  // Zen
  { id: "zen-hero", name: "Clock & greeting", emoji: "🍃", folder: "Design pieces/Zen", design: "zen", blurb: "Zen's huge calm clock.", w: 24, h: 25 },
  { id: "zen-lists", name: "Plain lists", emoji: "📃", folder: "Design pieces/Zen", design: "zen", blurb: "Folders as quiet lists of links.", w: 24, h: 40 },
];

export const PART_BY_ID = new Map(PARTS.map((p) => [p.id, p]));
export const PART_FOLDERS = ["Basic blocks", "Widgets", "Shapes & decoration", "Functions & buttons", "Design pieces"];
/** Designs whose pieces bring the floating-glass styling. */
export const GLASS_DESIGNS = ["nova", "orbit"];

/** The defaults for a part's options. */
export function defaultProps(part: PartDef): Record<string, PropValue> {
  return Object.fromEntries((part.props || []).map((p) => [p.key, p.def]));
}

/* ---------- starting points: each built-in design, rebuilt from pieces ---------- */
type T = [part: string, x: number, y: number, w: number, h: number, props?: Record<string, PropValue>, style?: PieceStyle];
const TEMPLATES: Record<string, { canvas: Partial<DesignCanvas>; pieces: T[] }> = {
  blank: { canvas: {}, pieces: [] },
  classic: {
    canvas: { bg: "#000000", text: "#f2f2f2", accent: "#7c6cff" },
    pieces: [["classic-topbar", 0, 0, 24, 4], ["banners", 0, 4, 24, 3], ["classic-hero", 3, 7, 18, 13], ["today", 3, 20, 18, 9], ["classic-actions", 3, 29, 18, 4], ["classic-chips", 3, 33, 18, 4], ["classic-folders", 3, 37, 18, 60], ["classic-footer", 3, 97, 18, 5]],
  },
  nova: {
    canvas: { bg: "#0b0d17", text: "#eef0ff", accent: "#8b7bff", font: "jakarta" },
    pieces: [["nova-sidebar", 0, 0, 5, 60], ["nova-topbar", 5, 0, 19, 5], ["banners", 5, 5, 19, 3], ["nova-home", 5, 8, 19, 52], ["nova-page", 5, 8, 19, 52, { mode: "popup" }]],
  },
  orbit: {
    canvas: { bg: "#0a0e1f", bgPattern: "aurora", text: "#eef2ff", accent: "#7aa2ff", font: "jakarta" },
    pieces: [["orbit-topbar", 0, 0, 24, 5], ["banners", 2, 5, 20, 3], ["orbit-home", 2, 8, 20, 38], ["orbit-window", 2, 8, 20, 38], ["orbit-dock", 5, 47, 14, 6]],
  },
  board: {
    canvas: { bg: "#f3f4f7", text: "#1d2330", accent: "#3b6cf6", tone: "light" },
    pieces: [["topbar", 0, 0, 24, 4], ["board-head", 1, 5, 22, 8], ["results", 1, 13, 22, 4], ["board-columns", 0, 17, 24, 42], ["polls", 1, 60, 11, 12], ["footer", 0, 73, 24, 5]],
  },
  desk: {
    canvas: { bg: "#f3f4f7", text: "#1d2330", accent: "#3b6cf6", tone: "light" },
    pieces: [["topbar", 0, 0, 24, 4], ["desk-home", 1, 5, 22, 17], ["desk-boxes", 1, 22, 22, 42], ["desk-dock", 7, 65, 10, 5]],
  },
  journal: {
    canvas: { bg: "#f6f1e7", text: "#1a1712", accent: "#9c2a1b", tone: "light", font: "newsreader" },
    pieces: [["topbar", 0, 0, 24, 4], ["journal-mast", 2, 4, 20, 14], ["journal-front", 2, 18, 20, 50], ["journal-section", 2, 18, 20, 50, { mode: "popup" }]],
  },
  terminal: {
    canvas: { bg: "#050805", text: "#33ff88", accent: "#33ff88", font: "mono" },
    pieces: [["term-tree", 0, 0, 6, 50], ["topbar", 6, 0, 18, 4], ["term-home", 6, 4, 18, 46], ["term-dir", 6, 4, 18, 46, { mode: "popup" }]],
  },
  zen: {
    canvas: { bg: "#f5f3ee", text: "#2b2a27", accent: "#6b8f71", tone: "light", font: "serif" },
    pieces: [["zen-hero", 0, 0, 24, 25], ["topbar", 4, 25, 16, 4], ["results", 4, 29, 16, 4], ["zen-lists", 3, 33, 18, 45]],
  },
  /* a starter that shows off a bit of everything */
  starter: {
    canvas: { bg: "#0d1020", bgPattern: "aurora", text: "#eef0ff", accent: "#8b7bff", font: "grotesk" },
    pieces: [
      ["blob", 0, 0, 10, 16, { a: "#7c6cff", b: "#ff5c9a", blur: 60 }],
      ["logo", 1, 1, 6, 3], ["search", 7, 1, 10, 3], ["bell", 19, 1, 2, 3], ["more", 20, 1, 2, 3], ["profile", 22, 1, 2, 3],
      ["greeting", 1, 6, 12, 5, { size: "l" }], ["clock", 16, 5, 7, 7, { size: "l" }],
      ["apps", 1, 12, 14, 12], ["pomodoro", 16, 13, 7, 11],
      ["folders", 1, 25, 22, 40], ["viewer", 2, 8, 20, 40],
    ],
  },
};
export const TEMPLATE_LIST: [string, string, string][] = [
  ["blank", "Blank page", "⬜"], ["starter", "Starter", "🌟"], ["classic", "Classic", "📄"], ["nova", "Nova", "✨"], ["orbit", "Orbit", "🪐"],
  ["board", "Board", "🗂️"], ["desk", "Desk", "🖥️"], ["journal", "Journal", "📰"], ["terminal", "Terminal", "💻"], ["zen", "Zen", "🍃"],
];

let seq = 0;
export const newPieceId = () => `p${Date.now().toString(36).slice(-5)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function makePiece(partId: string, x: number, y: number, z: number, over: Partial<DesignPiece> = {}): DesignPiece {
  const part = PART_BY_ID.get(partId)!;
  return {
    id: newPieceId(), part: partId, x, y, w: part.w, h: part.h, z,
    props: defaultProps(part),
    style: part.style ? { ...part.style } : undefined,
    ...over,
  };
}

export function templateDesign(key: string): Pick<BuiltDesign, "canvas" | "pieces"> {
  const t = TEMPLATES[key] || TEMPLATES.blank;
  const pieces = t.pieces.map(([part, x, y, w, h, props, style], i) => {
    const p = makePiece(part, x, y, i + 1, { w, h });
    if (props) p.props = { ...p.props, ...props };
    if (style) p.style = { ...p.style, ...style };
    return p;
  });
  const canvas = { ...DEFAULT_CANVAS, ...t.canvas };
  canvas.rows = Math.max(canvas.rows, ...pieces.map((p) => Math.ceil(p.y + p.h) + 4));
  return { canvas, pieces };
}

/* ---------- checking a design (the server does this before saving) ---------- */
const COLOR = /^(#[0-9a-f]{3,8}|transparent)$/i;
const color = (v: unknown, fallback?: string) => (typeof v === "string" && COLOR.test(v.trim()) ? v.trim() : fallback);
const num = (v: unknown, min: number, max: number, fallback?: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : fallback;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export const safeImageUrl = (v: unknown) => {
  const s = str(v, 500).trim();
  return /^https:\/\/[^\s"'()<>]+$/i.test(s) ? s : "";
};

export function cleanStyle(raw: unknown): PieceStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const s: PieceStyle = {};
  if (color(r.bg)) s.bg = color(r.bg);
  if (color(r.text)) s.text = color(r.text);
  if (color(r.accent)) s.accent = color(r.accent);
  if (color(r.borderColor)) s.borderColor = color(r.borderColor);
  if (r.glass === true) s.glass = true;
  if (r.opacity !== undefined) s.opacity = num(r.opacity, 0.05, 1);
  if (r.radius !== undefined) s.radius = num(r.radius, 0, 999);
  if (r.borderWidth !== undefined) s.borderWidth = num(r.borderWidth, 0, 12);
  if (r.pad !== undefined) s.pad = num(r.pad, 0, 80);
  if (r.size !== undefined) s.size = num(r.size, 50, 250);
  if (["none", "soft", "strong", "glow"].includes(String(r.shadow))) s.shadow = r.shadow as PieceStyle["shadow"];
  if (["show", "hide"].includes(String(r.phone))) s.phone = r.phone as PieceStyle["phone"];
  if (FONT_CHOICES.some((f) => f.id === r.font)) s.font = r.font as string;
  return Object.keys(s).length ? s : undefined;
}

export function cleanCanvas(raw: unknown): DesignCanvas {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    bg: color(r.bg, DEFAULT_CANVAS.bg)!,
    bgImage: safeImageUrl(r.bgImage),
    bgPattern: ["none", "dots", "grid", "gradient", "aurora", "stripes"].includes(String(r.bgPattern)) ? (r.bgPattern as DesignCanvas["bgPattern"]) : "none",
    text: color(r.text, DEFAULT_CANVAS.text)!,
    accent: color(r.accent, DEFAULT_CANVAS.accent)!,
    font: FONT_CHOICES.some((f) => f.id === r.font) ? String(r.font) : "inter",
    tone: r.tone === "light" ? "light" : "dark",
    rows: num(r.rows, 20, 600, 60)!,
  };
}

export function cleanPieces(raw: unknown): DesignPiece[] {
  if (!Array.isArray(raw)) return [];
  const out: DesignPiece[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 150) as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const part = PART_BY_ID.get(String(r.part));
    if (!part) continue;
    let id = /^[a-z0-9]{3,24}$/i.test(String(r.id)) ? String(r.id) : newPieceId();
    if (seen.has(id)) id = newPieceId();
    seen.add(id);
    const w = num(r.w, 0.5, COLS, part.w)!;
    const piece: DesignPiece = {
      id, part: part.id,
      x: num(r.x, 0, COLS - Math.min(w, COLS), 0)!,
      y: num(r.y, 0, 1000, 0)!,
      w,
      h: num(r.h, 0.5, 400, part.h)!,
      z: Math.round(num(r.z, 0, 10000, 1)!),
    };
    if (typeof r.name === "string" && r.name.trim()) piece.name = r.name.trim().slice(0, 40);
    if (r.locked === true) piece.locked = true;
    if (r.hidden === true) piece.hidden = true;
    const style = cleanStyle(r.style);
    if (style) piece.style = style;
    // only known options, each checked by its type
    const props: Record<string, PropValue> = {};
    const given = (r.props && typeof r.props === "object" ? r.props : {}) as Record<string, unknown>;
    for (const def of part.props || []) {
      const v = given[def.key];
      if (v === undefined) { props[def.key] = def.def; continue; }
      switch (def.type) {
        case "bool": props[def.key] = v === true; break;
        case "number": props[def.key] = num(v, def.min ?? -1e6, def.max ?? 1e6, def.def as number)!; break;
        case "select": case "action": props[def.key] = (def.options || []).some(([k]) => k === v) ? String(v) : def.def; break;
        case "color": props[def.key] = color(v, def.def as string)!; break;
        case "url": props[def.key] = safeImageUrl(v); break;
        case "date": props[def.key] = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : ""; break;
        case "time": props[def.key] = /^\d{2}:\d{2}$/.test(String(v)) ? String(v) : def.def; break;
        case "emoji": props[def.key] = str(v, 16); break;
        case "folder": props[def.key] = /^[\w-]{0,64}$/.test(String(v)) ? String(v) : ""; break;
        case "longtext": props[def.key] = str(v, 2000); break;
        default: props[def.key] = str(v, 300);
      }
    }
    piece.props = props;
    out.push(piece);
  }
  return out;
}

/** Every bit of text people wrote in a design (for the word filter). */
export function designTexts(d: Pick<BuiltDesign, "pieces">): string[] {
  const out: string[] = [];
  for (const p of d.pieces) {
    if (p.name) out.push(p.name);
    const part = PART_BY_ID.get(p.part);
    for (const def of part?.props || []) if (["text", "longtext"].includes(def.type) && typeof p.props?.[def.key] === "string") out.push(p.props[def.key] as string);
  }
  return out;
}
