import type { Metadata } from "next";
import { getBookmarks, viewFor } from "@/lib/store";
import Go from "./Go";

export const dynamic = "force-dynamic";

/** The folder as a visitor who isn't logged in would see it (nothing more is shared). */
async function publicFolder(id: string) {
  try {
    const data = viewFor(await getBookmarks(), { admin: false, member: false });
    const folder = data.folders.find((f) => f.id === id && !f.archived && !f.rule);
    return folder ? { folder, title: data.settings?.title || "Theo's Bookmarks" } : null;
  } catch {
    return null;
  }
}

/**
 * A link to one folder that shows a proper preview card when it's pasted
 * into a chat app or email (title, how many websites, the first few
 * names), then opens the folder on the main page.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const found = await publicFolder(params.id);
  if (!found) return { title: "Theo's Bookmarks", description: "Shared school bookmarks" };
  const { folder, title } = found;
  const names = folder.links.slice(0, 5).map((l) => l.name).join(", ");
  const description = `${folder.description ? `${folder.description} · ` : ""}${folder.links.length} website${folder.links.length === 1 ? "" : "s"}${names ? `: ${names}${folder.links.length > 5 ? "…" : ""}` : ""}`;
  const name = `${folder.emoji} ${folder.name}`;
  return {
    title: `${name} · ${title}`,
    description,
    openGraph: { title: name, description, siteName: title, type: "website" },
    twitter: { card: "summary", title: name, description },
  };
}

export default async function SharedFolder({ params }: { params: { id: string } }) {
  const found = await publicFolder(params.id);
  return (
    <div className="app shared-folder">
      {found ? (
        <>
          <h1>{found.folder.emoji} {found.folder.name}</h1>
          {found.folder.description && <p>{found.folder.description}</p>}
          <p className="muted-inline">{found.folder.links.length} websites on {found.title} — opening the folder…</p>
          <ul className="embed-list">
            {found.folder.links.slice(0, 30).map((l) => <li key={l.id}>{l.name}</li>)}
          </ul>
          <Go to={`/#folder-${found.folder.id}`} />
        </>
      ) : (
        <>
          <h1>That folder isn&apos;t available</h1>
          <p>It may have been removed, or it&apos;s only for members — <a href="/">open the site</a> and log in.</p>
        </>
      )}
    </div>
  );
}
