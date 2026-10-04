/**
 * Español. Rather than changing every component, this swaps the site's own
 * interface text (labels, buttons, tooltips, placeholders) for Spanish as it
 * appears on screen, and puts the English back when you switch. What people
 * write — link names, folders, chat, posts, wiki pages — is never touched.
 */
const ES: Record<string, string> = {
  // top bar, menus
  "Search": "Buscar", "Log in": "Entrar", "Log out": "Cerrar sesión", "Sign up": "Registrarse", "More": "Más", "Home": "Inicio", "Chat": "Chat",
  "Admin panel": "Panel de administración", "Admin login": "Acceso de administración", "Tools": "Herramientas", "Tools (O)": "Herramientas (O)",
  "Spin the wheel (S)": "Girar la ruleta (S)", "Community (L)": "Comunidad (L)", "Spin the wheel": "Girar la ruleta", "Community": "Comunidad",
  "Command menu": "Menú de comandos", "Suggest a change": "Sugerir un cambio", "Edit profile": "Editar perfil", "What's new": "Novedades",
  "Customize look": "Personalizar aspecto", "Light mode": "Modo claro", "Dark mode": "Modo oscuro", "Collapse / expand all": "Contraer / expandir todo",
  "Keyboard shortcuts": "Atajos de teclado", "Install app": "Instalar la app", "Install the app": "Instalar la app", "Help": "Ayuda",
  "Report a bug": "Informar de un error", "Message an admin": "Escribir a un administrador", "Print the list": "Imprimir la lista",
  "Download for my browser": "Descargar para mi navegador", "Add from any website…": "Añadir desde cualquier web…", "The last 7 days": "Los últimos 7 días",
  "Community page": "Página de la comunidad", "What's this? (explain buttons)": "¿Qué es esto? (explica los botones)", "View as a member": "Ver como miembro",
  "Back to admin view": "Volver a la vista de administración", "Account & security": "Cuenta y seguridad", "Saved": "Guardados", "Back to top": "Volver arriba",
  // hero & actions
  "websites": "sitios web", "folders": "carpetas", "visits": "visitas", "online": "en línea", "Add website": "Añadir web", "New folder": "Nueva carpeta",
  "Suggest a website": "Sugerir una web", "# Tags": "# Etiquetas", "Collapse all": "Contraer todo", "Expand all": "Expandir todo",
  "Manual order": "Orden manual", "Name A–Z": "Nombre A–Z", "Newest first": "Más nuevos primero", "Most visited": "Más visitados", "Most liked": "Más gustados",
  "Top rated": "Mejor valorados", "My ratings": "Mis valoraciones", "Grid view": "Vista de cuadrícula", "List view": "Vista de lista", "Jump to": "Ir a",
  "Shortcuts": "Accesos", "Recent": "Recientes", "Read later": "Leer después", "Starred": "Destacados", "Following": "Siguiendo", "New": "Nuevo", "Views": "Vistas",
  "Save this view": "Guardar esta vista", "Clear": "Borrar", "Best match": "Mejor coincidencia", "Newest": "Más nuevos", "Folder order": "Orden de carpetas",
  "In chat": "En el chat", "Nothing found": "No se encontró nada", "Good morning": "Buenos días", "Good afternoon": "Buenas tardes", "Good evening": "Buenas tardes", "Good night": "Buenas noches", "Up late": "Despierto tarde",
  // today strip & polls
  "Today": "Hoy", "Link of the day": "Enlace del día", "Would you rather…": "¿Qué prefieres…?", "Riddle": "Acertijo", "Show the answer": "Ver la respuesta",
  "Challenge": "Reto", "Featured folder": "Carpeta destacada", "Featured person": "Persona destacada", "Next goal": "Próxima meta", "On this day": "Tal día como hoy",
  "Happy birthday!": "¡Feliz cumpleaños!", "Hide for today": "Ocultar por hoy", "Show today’s stuff": "Mostrar lo de hoy", "Poll": "Encuesta",
  "⭐ Poll of the week": "⭐ Encuesta de la semana", "Poll closed": "Encuesta cerrada", "Log in to vote": "Inicia sesión para votar",
  "Tap your answer again to take your vote back": "Toca tu respuesta otra vez para quitar tu voto",
  // folders & cards
  "Add a website to": "Añadir una web a", "Open all in new tabs": "Abrir todo en pestañas nuevas", "Copy a link to this folder": "Copiar un enlace a esta carpeta",
  "Edit folder": "Editar carpeta", "Delete folder": "Borrar carpeta", "Filter this folder": "Filtrar esta carpeta", "About this folder": "Sobre esta carpeta",
  "Add a private note": "Añadir una nota privada", "Edit my note": "Editar mi nota", "Random website from here": "Web al azar de aquí",
  "Copy as a Markdown list": "Copiar como lista Markdown", "Download as a spreadsheet": "Descargar como hoja de cálculo", "Copy embed code": "Copiar código para insertar",
  "Favorite folder (shows first)": "Carpeta favorita (sale primero)", "Unfavorite folder": "Quitar de favoritas", "This folder is empty.": "Esta carpeta está vacía.",
  "Add the first website": "Añadir la primera web", "Read aloud": "Leer en voz alta", "🔊 Read aloud": "🔊 Leer en voz alta", "📤 Share": "📤 Compartir",
  "🚩 Report a problem": "🚩 Informar de un problema", "🙏 Say thanks": "🙏 Dar las gracias", "Add a note for everyone": "Añadir una nota para todos",
  "Mark done": "Marcar como hecho", "Done": "Hecho", "Rename for me": "Renombrar para mí", "Hide for me": "Ocultar para mí", "Close": "Cerrar",
  "Your private note": "Tu nota privada", "— only you see this": "— solo la ves tú", "Checklist": "Lista de pasos", "Goes with": "Va con", "Similar": "Parecidos",
  "Added by": "Añadido por", "Ratings": "Valoraciones",
  // modals & forms
  "Add a website": "Añadir una web", "Cancel": "Cancelar", "Save": "Guardar", "Save changes": "Guardar cambios", "Add for everyone": "Añadir para todos",
  "Name": "Nombre", "Folder": "Carpeta", "Tags": "Etiquetas", "Description": "Descripción", "Welcome back": "Bienvenido de nuevo", "Create an account": "Crear una cuenta",
  "Username": "Usuario", "Password": "Contraseña", "Forgot password?": "¿Olvidaste la contraseña?", "Keep me logged in on this device": "Mantener la sesión en este dispositivo",
  "Invite code": "Código de invitación", "Reset password": "Restablecer contraseña", "Got it": "Entendido", "Delete": "Borrar", "Copy": "Copiar", "Send": "Enviar",
  "🐞 Report a bug": "🐞 Informar de un error", "✉️ Message an admin": "✉️ Escribir a un administrador",
  // customize
  "🎨 Customize": "🎨 Personalizar", "Colours": "Colores", "Text": "Texto", "Layout": "Diseño", "Effects": "Efectos", "Accessibility": "Accesibilidad", "Share": "Compartir",
  "Theme": "Tema", "Accent colour": "Color de acento", "Background": "Fondo", "Font": "Fuente", "Icons": "Iconos", "Card size": "Tamaño de las tarjetas",
  "Card style": "Estilo de tarjeta", "Page width": "Ancho de página", "Animations": "Animaciones", "High contrast": "Alto contraste", "Reset everything": "Restablecer todo",
  "Bigger buttons": "Botones más grandes", "Always underline links": "Subrayar siempre los enlaces", "Warn before leaving": "Avisar antes de salir",
  // bottom nav, footer, misc
  "How's this page?": "¿Qué tal esta página?", "Thanks for telling us! 💜": "¡Gracias por decírnoslo! 💜", "What's changed": "Qué ha cambiado", "Rules": "Normas", "Privacy": "Privacidad",
  "Skip to content": "Saltar al contenido", "Show more": "Mostrar más", "Loading…": "Cargando…", "Try again": "Intentar de nuevo", "Back": "Atrás", "Next": "Siguiente", "Skip": "Saltar",
  "Up to date": "Al día", "Copied": "Copiado", "Link copied": "Enlace copiado", "Pull to refresh": "Desliza para actualizar", "Let go to refresh": "Suelta para actualizar", "Refreshing…": "Actualizando…",
  "Stay logged in": "Seguir conectado", "Bookmarks": "Marcadores", "People": "Personas", "Wiki": "Wiki", "Find a tool…": "Buscar una herramienta…", "Choose": "Elegir",
  // community
  "🔎 Link requests": "🔎 Peticiones de enlaces", "❓ Q&A": "❓ Preguntas", "💡 Tips": "💡 Consejos", "🏁 Challenge": "🏁 Reto", "🏆 Link of the month": "🏆 Enlace del mes",
  "🗺️ Ideas & roadmap": "🗺️ Ideas y planes", "👏 Shoutouts": "👏 Menciones", "📖 Guestbook": "📖 Libro de visitas", "📅 Events": "📅 Eventos",
  "🌟 Hall of fame": "🌟 Salón de la fama", "📊 Monthly recap": "📊 Resumen del mes", "Top": "Lo mejor", "Unanswered": "Sin responder", "Post idea": "Publicar idea",
  // help
  "Questions": "Preguntas", "Take the tour": "Hacer el recorrido", "Site rules": "Normas del sitio",
  // bits that appear inside longer lines
  "pick any": "elige varias", "anonymous": "anónima", "ends soon": "termina pronto", "Happy Halloween": "Feliz Halloween", "Merry Christmas": "Feliz Navidad",
  "Happy New Year!": "¡Feliz Año Nuevo!", "Report": "Informar", "Block": "Bloquear", "Reply": "Responder", "Quote": "Citar", "Thread": "Hilo", "Edit": "Editar",
  "Copy text": "Copiar texto", "Copy link": "Copiar enlace", "Save for later": "Guardar para después", "Pin": "Fijar", "Unpin": "Desfijar",
  "Name A–Z ": "Nombre A–Z ", "Light / dark theme": "Tema claro / oscuro", "Customize the look": "Personalizar el aspecto", "Open or close chat": "Abrir o cerrar el chat",
  "Add a website ": "Añadir una web ", "Open a random website": "Abrir una web al azar", "Grid / list view": "Cuadrícula / lista", "This list": "Esta lista",
  "Tools drawer": "Cajón de herramientas", "Focus timer": "Temporizador", "Close / clear search": "Cerrar / borrar la búsqueda", "Open the top search result": "Abrir el primer resultado",
  "Community & leaderboard": "Comunidad y clasificación", "Collapse / expand all folders": "Contraer / expandir todas las carpetas",
};
const ES_PATTERNS: [RegExp, string][] = [
  [/^(\d+) websites?$/, "$1 sitios web"], [/^(\d+) folders?$/, "$1 carpetas"], [/^(\d+) visits?$/, "$1 visitas"], [/^(\d+) online$/, "$1 en línea"],
  [/^Search (\d+) websites(\.\.\.|…)$/, "Buscar en $1 sitios web$2"], [/^The site turns (\d+) today$/, "El sitio cumple $1 años hoy"],
  [/^ends in (\d+)([hd])$/, "termina en $1 $2"], [/^(\d+) answers?$/, "$1 respuestas"], [/^(\d+) in 2 weeks$/, "$1 en 2 semanas"],
  [/^in (.+)$/, "en $1"], [/^Logged in as (.+)$/, "Conectado como $1"], [/^(\d+) votes?$/, "$1 votos"], [/^(\d+) new$/, "$1 nuevos"],
  [/^(\d+)m ago$/, "hace $1 min"], [/^(\d+)h ago$/, "hace $1 h"], [/^(\d+)d ago$/, "hace $1 d"], [/^just now$/, "ahora mismo"],
  [/^Added (.+) for everyone$/, "Añadido $1 para todos"], [/^(\d+) of (\d+)$/, "$1 de $2"],
];

/** Text that people wrote — never translated. */
const USER_CONTENT = ".card-title, .card-host, .card-desc, .fh-name, .fh-desc, .msg-text, .post-text, .post-title, .md, .wiki-body, .note-preview, .quick-chip, .tt-link, .sb-text, .sugg-note, .chat-panel .msg, .poll h3, .poll-label, [data-no-translate], input, textarea";
const ATTRS = ["placeholder", "title", "aria-label"] as const;

type Orig = { text?: string; shown?: string; attrs?: Partial<Record<(typeof ATTRS)[number], string>> };
const originals = new WeakMap<Node, Orig>();

function trOne(t: string): string | null {
  const hit = ES[t];
  if (hit) return hit;
  for (const [re, out] of ES_PATTERNS) if (re.test(t)) return t.replace(re, out);
  // a leading emoji ("🎂 Happy birthday!") — translate what follows it
  const m = /^(\p{Extended_Pictographic}\uFE0F?\s*)(.+)$/u.exec(t);
  if (m) { const rest = trOne(m[2]); if (rest) return m[1] + rest; }
  return null;
}
function tr(s: string): string | null {
  const t = s.trim();
  if (!t || t.length > 160) return null;
  const whole = trOne(t);
  if (whole) return s.replace(t, whole);
  // lines made of parts: "0 votes · pick any · ends in 3d"
  if (t.includes(" · ")) {
    const parts = t.split(" · ");
    const done = parts.map((p) => trOne(p.trim()) ?? p);
    if (done.some((p, i) => p !== parts[i])) return s.replace(t, done.join(" · "));
  }
  return null;
}
function skip(el: Element | null) {
  return !el || !!el.closest(USER_CONTENT) || el.closest("script, style, code, pre") !== null;
}
/** The English for a text node: what React put there, or what we saved before translating it. */
function englishOf(node: Node) {
  const o = originals.get(node);
  const cur = node.nodeValue || "";
  return o?.text !== undefined && cur === o.shown ? o.text : cur;
}
/**
 * React splits "The site turns {n} today" into several text pieces, so an
 * element whose children are all text is read (and translated) as one line.
 */
function translateTextOf(el: Element) {
  if (skip(el)) return;
  const kids = Array.from(el.childNodes);
  const texts = kids.filter((k) => k.nodeType === Node.TEXT_NODE);
  if (!texts.length) return;
  let groups: Node[][] = kids.length === texts.length && texts.length > 1 ? [texts] : texts.map((t) => [t]);
  // the whole line has no translation: try its pieces one by one ("Good evening" + " 👋")
  if (groups.length === 1 && groups[0].length > 1 && tr(groups[0].map(englishOf).join("")) === null) groups = texts.map((t) => [t]);
  for (const group of groups) {
    const english = group.map(englishOf);
    const next = tr(english.join(""));
    if (next === null) {
      // nothing to translate (any more): put back English we'd replaced
      group.forEach((k, i) => { const o = originals.get(k); if (o && k.nodeValue === o.shown) k.nodeValue = english[i]; originals.delete(k); });
      continue;
    }
    group.forEach((k, i) => {
      const val = i === 0 ? next : "";
      originals.set(k, { text: english[i], shown: val });
      if (k.nodeValue !== val) k.nodeValue = val;
    });
  }
}
function translateAttrs(el: Element) {
  if (el.closest("[data-no-translate]")) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const o = originals.get(el) || {};
    const saved = o.attrs?.[a];
    if (saved !== undefined && v === tr(saved)) continue;
    const next = tr(v);
    if (!next) continue;
    originals.set(el, { ...o, attrs: { ...(o.attrs || {}), [a]: v } });
    el.setAttribute(a, next);
  }
}
function translateTree(root: Node) {
  const start = root.nodeType === Node.TEXT_NODE ? root.parentElement : root instanceof Element ? root : null;
  if (!start) return;
  translateAttrs(start);
  translateTextOf(start);
  const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    translateAttrs(n as Element);
    translateTextOf(n as Element);
  }
}
function restoreTree(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = root; n; n = walker.nextNode()) {
    const o = originals.get(n);
    if (!o) continue;
    if (n.nodeType === Node.TEXT_NODE && o.text !== undefined && n.nodeValue === o.shown) n.nodeValue = o.text;
    if (n instanceof Element && o.attrs) for (const [a, v] of Object.entries(o.attrs)) if (v !== undefined) n.setAttribute(a, v);
    originals.delete(n);
  }
}

let observer: MutationObserver | null = null;
let pending: Node[] = [];
let scheduled = false;
function flush() {
  scheduled = false;
  const nodes = pending;
  pending = [];
  observer?.disconnect();
  for (const n of nodes) if (n.isConnected) translateTree(n);
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}
function on() {
  if (observer) return;
  document.documentElement.lang = "es";
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") { pending.push(m.target); m.addedNodes.forEach((n) => pending.push(n)); }
      else pending.push(m.target.nodeType === Node.TEXT_NODE ? m.target.parentNode || m.target : m.target);
    }
    if (!scheduled) { scheduled = true; setTimeout(flush, 0); } // a timer, not a frame: frames pause in background tabs
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}
function off() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
  document.documentElement.lang = "en";
  restoreTree(document.body);
}

/** Follows <html data-lang="…"> (set from your Customize choice) and switches the page's language. */
export function startTranslator() {
  const apply = () => (document.documentElement.getAttribute("data-lang") === "es" ? on() : off());
  apply();
  const watch = new MutationObserver(apply);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang"] });
  return () => { watch.disconnect(); off(); };
}
export const resolveLang = (lang: "auto" | "en" | "es") =>
  lang === "auto" ? (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es") ? "es" : "en") : lang;
