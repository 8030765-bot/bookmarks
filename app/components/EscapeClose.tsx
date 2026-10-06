"use client";
import { useEffect } from "react";

/**
 * Esc closes whatever is on top — a pop-up, a drawer or a menu — and only
 * that one, on every page. It works by "clicking outside" the top one, so
 * each pop-up closes the same way it does with the mouse (including asking
 * about unsaved changes).
 */
export default function EscapeClose() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      const layers = Array.from(document.querySelectorAll<HTMLElement>(".modal-overlay, .drawer-backdrop, .menu-backdrop"))
        .filter((el) => el.getClientRects().length > 0);
      const top = layers[layers.length - 1];
      if (!top) return;
      e.preventDefault();
      top.click();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return null;
}
