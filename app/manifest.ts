import type { MetadataRoute } from "next";

// Lets people "Install" the site / add it to their home screen, share links
// into it from other apps, and long-press the icon for shortcuts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Theo's Bookmarks",
    short_name: "Bookmarks",
    description: "Shared school bookmarks — made by Theo 7A",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // the splash screen while the app opens
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    // "Share" from another app straight into the add box (handled by ?url= / ?text=)
    // (Next's type for this is out of date; browsers expect the standard shape below)
    share_target: { action: "/", method: "get", params: { title: "title", text: "text", url: "url" } } as unknown as MetadataRoute.Manifest["share_target"],
    shortcuts: [
      { name: "Add a website", short_name: "Add", url: "/?add=new", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Search", short_name: "Search", url: "/?focus=search", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Chat", short_name: "Chat", url: "/?chat=open", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Tools", short_name: "Tools", url: "/tools", icons: [{ src: "/icon.svg", sizes: "any" }] },
    ],
  };
}
