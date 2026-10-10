import Link from "next/link";

export default function NotFound() {
  return (
    <div className="app">
      <div className="hero">
        <h1>Page not found</h1>
        <p>That page doesn&apos;t exist.</p>
      </div>
      <div style={{ textAlign: "center" }}>
        <Link className="btn btn-primary" href="/">Back to the bookmarks</Link>
      </div>
    </div>
  );
}
