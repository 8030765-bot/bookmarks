// Load test: pretend N people have the page open and see how the server copes.
//   node tests/load.mjs [people=30] [seconds=20]
// Only ever point this at a local or preview server — never production.
const BASE = process.env.BASE_URL || "http://localhost:3456";
if (/vercel\.app|\.com|\.org/.test(BASE) && !process.env.I_KNOW) {
  console.error("Refusing to load-test a public URL. Set I_KNOW=1 if this really is a throwaway preview.");
  process.exit(1);
}
const people = Number(process.argv[2] || 30);
const seconds = Number(process.argv[3] || 20);
const stop = Date.now() + seconds * 1000;
const times = [];
let errors = 0;

async function timed(path) {
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    await r.arrayBuffer();
    if (!r.ok) errors++;
  } catch {
    errors++;
  }
  times.push(performance.now() - t);
}

async function person() {
  await timed("/api/bookmarks");
  while (Date.now() < stop) {
    await timed("/api/sync");
    // like a real page: mostly cheap sync polls, the odd full refresh
    if (Math.random() < 0.05) await timed("/api/bookmarks");
    await new Promise((r) => setTimeout(r, 2500));
  }
}

console.log(`${people} people for ${seconds}s against ${BASE}…`);
await Promise.all(Array.from({ length: people }, person));
times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))].toFixed(0);
console.log(`${times.length} requests, ${errors} errors`);
console.log(`median ${pct(50)} ms · p95 ${pct(95)} ms · p99 ${pct(99)} ms · max ${times.at(-1).toFixed(0)} ms`);
console.log(`≈ ${(times.length / seconds).toFixed(1)} requests/second`);
