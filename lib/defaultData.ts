import { BookmarksData } from "./types";

const now = () => new Date().toISOString();

export const defaultData: BookmarksData = {
  folders: [
    {
      id: "hubs",
      name: "Hubs",
      emoji: "🏠",
      pinned: true,
      color: "#7c6cff",
      createdAt: now(),
      links: [
        { id: "home", name: "Home", url: "https://vush.my.canva.site/", clicks: 0, createdAt: now(), tags: ["main"] },
        { id: "truffled", name: "Education - Truffled", url: "https://truf.the-nest.at/", clicks: 0, createdAt: now(), tags: ["school"] },
        { id: "anura", name: "anura os", url: "https://anura.pro/", clicks: 0, createdAt: now(), tags: ["os"] },
        { id: "cherri", name: "cherri", url: "https://cherrion.top/", clicks: 0, createdAt: now() },
      ],
    },
    {
      id: "proxies",
      name: "Proxies",
      emoji: "🔒",
      color: "#3dd68c",
      createdAt: now(),
      links: [
        { id: "something", name: "something", url: "https://holyunblocker.org/ultraviolet", clicks: 0, createdAt: now(), tags: ["proxy"] },
        { id: "scramjet", name: "Scramjet", url: "https://scramjet.mercurywork.shop/", clicks: 0, createdAt: now(), tags: ["proxy"] },
        { id: "nettleweb", name: "NettleWeb", url: "https://whitesp.eu.org/", clicks: 0, createdAt: now(), tags: ["proxy"] },
      ],
    },
    {
      id: "helios-gust",
      name: "Helios & gust",
      emoji: "☀️",
      color: "#ffb84d",
      createdAt: now(),
      links: [
        { id: "helios", name: "Helios (GitHub)", url: "https://github.com/dinguschan-owo/Helios/blob/main/README.md", clicks: 0, createdAt: now() },
        { id: "gust", name: "GUST Patcher", url: "https://gust-browser.vercel.app/", clicks: 0, createdAt: now() },
      ],
    },
  ],
  activity: [],
  settings: { theme: "dark", viewMode: "grid", sortBy: "manual" },
};
