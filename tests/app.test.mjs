// The installed app: manifest with sharing into the site, icon shortcuts and splash colours.
import { BASE, done, ok, waitForServer } from "./helpers.mjs";

await waitForServer();
const res = await fetch(`${BASE}/manifest.webmanifest`);
const m = await res.json();
ok("manifest is served", res.status === 200 && m.name === "Theo's Bookmarks");
ok("installs as a full-screen app", m.display === "standalone" && m.start_url === "/");
ok("other apps can share links into it", m.share_target?.action === "/" && m.share_target.method === "get" && m.share_target.params?.url === "url" && m.share_target.params?.text === "text", JSON.stringify(m.share_target));
ok("long-press shortcuts: add, search, chat, tools", ["/?add=new", "/?focus=search", "/?chat=open", "/tools"].every((u) => m.shortcuts?.some((s) => s.url === u)), JSON.stringify(m.shortcuts));
ok("splash colours and a maskable icon", !!m.background_color && m.icons?.some((i) => i.purpose === "maskable"));
done();
