"use client";
import { createContext, useContext } from "react";
import { Folder, Link } from "@/lib/types";
import type { LinkPref } from "./Personal";
import type { LinkRef } from "./ui";

export interface RatingAgg { avg: number; count: number; hist?: number[] }

export const STATUS_LABEL: Record<string, string> = { works: "Works", login: "Needs login", slow: "Slow", broken: "Broken" };
export const STICKER_LABEL: Record<string, string> = { hot: "🔥 Hot", new: "🆕 New", essential: "⭐ Essential" };
export const COST_LABEL: Record<string, string> = { free: "Free", paid: "Paid", account: "Needs account" };

export interface LinkCardActions {
  /** open links in a new tab (user preference) */
  newTab: boolean;
  open: (folder: Folder, link: Link) => void;
  star: (folder: Folder, link: Link) => void;
  copy: (link: Link) => void;
  edit: (folder: Folder, link: Link) => void;
  remove: (folder: Folder, link: Link) => void;
  suggest: (folder: Folder, link: Link) => void;
  like: (folder: Folder, link: Link) => void;
  filterTag: (tag: string) => void;
  rate: (linkId: string, stars: number) => void;
  openProfile: (username: string) => void;
  /** your private extras: note, read later, done, rename, hide, checklist ticks */
  pref: (linkId: string, patch: Partial<LinkPref>) => void;
  /** admin: change a field on the shared link */
  adminEdit: (folder: Folder, link: Link, patch: Partial<Link>) => void;
  /** right-click / ⋯ menu */
  menu: (folder: Folder, link: Link, at: { x: number; y: number }) => void;
  /** tick / untick for multi-select (shift = range) */
  select: (linkId: string, shift: boolean) => void;
  /** ask for a line of text (private note, rename…) */
  prompt: (title: string, initial: string, onSave: (value: string) => void, opts?: { multiline?: boolean; placeholder?: string }) => void;
  toast: (msg: string) => void;
}

/** Everything a card needs that's the same for every card on the page. */
export interface CardEnv {
  actions: LinkCardActions;
  me: string | null;
  admin: boolean;
  favorites: Set<string>;
  ratings: Record<string, RatingAgg>;
  myRatings: Record<string, number>;
  prefs: Record<string, LinkPref>;
  /** when you were last here (ms) — links added/edited since then get a badge */
  since: number;
  descriptions: boolean;
  iconTint: boolean;
  selected: Set<string>;
  focusedId: string | null;
  expandedId: string | null;
  setExpanded: (id: string | null) => void;
  query: string;
  allRefs: LinkRef[];
  folderById: Map<string, Folder>;
  /** when each link was last opened on this device */
  lastOpened: Map<string, number>;
}

export const CardContext = createContext<CardEnv | null>(null);
export function useCardEnv() {
  const env = useContext(CardContext);
  if (!env) throw new Error("CardContext missing");
  return env;
}
