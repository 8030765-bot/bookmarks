"use client";
import { useEffect } from "react";

/** Off to the folder on the main page (the server page above is for link previews). */
export default function Go({ to }: { to: string }) {
  useEffect(() => { location.replace(to); }, [to]);
  return <p><a className="btn btn-primary" href={to}>Open the folder</a></p>;
}
