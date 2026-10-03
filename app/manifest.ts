import type { MetadataRoute } from "next";

// Lets people "Install" the site / add it to their home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Theo's Bookmarks",
    short_name: "Bookmarks",
    description: "Shared school bookmarks — made by Theo 7A",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
