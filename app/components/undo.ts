"use client";
/**
 * Ctrl+Z / Ctrl+Y for your last 10 changes on this page. Each change
 * records how to take itself back (and how to do it again), so undoing
 * only touches your own change — never someone else's edit made since.
 */
export interface UndoStep {
  /** "Liked Desmos", "Deleted Coolmath" */
  label: string;
  undo: () => Promise<unknown> | unknown;
  redo: () => Promise<unknown> | unknown;
}
const MAX = 10;
let past: UndoStep[] = [];
let future: UndoStep[] = [];
let busy = false;

export function recordUndo(step: UndoStep) {
  past = [...past, step].slice(-MAX);
  future = [];
}
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

/** Undo the latest change; returns its label (or null when there's nothing to undo). */
export async function undoLast(): Promise<string | null> {
  const step = past[past.length - 1];
  if (!step || busy) return null;
  busy = true;
  try {
    await step.undo();
    past = past.slice(0, -1);
    future = [...future, step].slice(-MAX);
    return step.label;
  } finally {
    busy = false;
  }
}
export async function redoLast(): Promise<string | null> {
  const step = future[future.length - 1];
  if (!step || busy) return null;
  busy = true;
  try {
    await step.redo();
    future = future.slice(0, -1);
    past = [...past, step].slice(-MAX);
    return step.label;
  } finally {
    busy = false;
  }
}
/** Forget everything (e.g. after logging out). */
export function clearUndo() {
  past = [];
  future = [];
}
