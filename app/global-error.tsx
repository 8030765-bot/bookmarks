"use client";

/** Last-resort error screen if even the page layout fails to render. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#000", color: "#ededed", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <h1 style={{ fontSize: "1.4rem" }}>The site hit an error</h1>
          <p style={{ color: "#a1a1a1" }}>{error.message || "Unknown error"}</p>
          <button
            onClick={() => (reset ? reset() : location.reload())}
            style={{ marginTop: "1rem", padding: ".55rem 1rem", borderRadius: 10, border: "1px solid #2e2e2e", background: "#0a0a0a", color: "#ededed", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
