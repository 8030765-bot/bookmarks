"use client";
import { useEffect } from "react";

/** Shown instead of a blank page if something on the page crashes. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="app">
      <div className="hero"><h1>Something broke</h1></div>
      <div className="error-box">
        <strong>This part of the page hit an error.</strong>
        <p>{error.message || "Unknown error"}{error.digest ? ` (ref ${error.digest})` : ""}</p>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button className="btn btn-secondary btn-sm" onClick={reset}>Try again</button>
          <button className="btn btn-secondary btn-sm" onClick={() => location.reload()}>Reload the page</button>
        </div>
      </div>
    </div>
  );
}
