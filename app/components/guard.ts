"use client";
import { useEffect, useRef, useState } from "react";

/**
 * "You have unsaved changes — close anyway?" for forms. A form registers
 * whether it has changes; closing it by clicking outside or pressing Esc
 * asks first. (The form's own Cancel button doesn't ask.)
 */
let checks: (() => boolean)[] = [];
export function useUnsavedGuard(dirty: boolean) {
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => {
    const fn = () => ref.current;
    checks.push(fn);
    return () => { checks = checks.filter((x) => x !== fn); };
  }, []);
}
/** True if it's fine to close (nothing unsaved, or they said yes). */
export function confirmDiscard() {
  if (!checks.some((c) => c())) return true;
  return confirm("You have changes that aren't saved. Close anyway?");
}

/** A "✓ Saved" that flashes after each change. */
export function useSavedTick() {
  const [n, setN] = useState(0);
  return { saved: () => setN((x) => x + 1), tick: n };
}
