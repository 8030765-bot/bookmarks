export interface Link {
  id: string;
  name: string;
  url: string;
  icon?: string;
  notes?: string;
  tags?: string[];
  favorite?: boolean;
  clicks?: number;
  createdAt?: string;
  updatedAt?: string;
  color?: string;
  /** username who added it (or who suggested it) */
  addedBy?: string;
  /** lowercase usernames who liked it */
  likes?: string[];
  /** emoji shown on the card next to the name */
  emoji?: string;
  /** shown first in its folder (admin) */
  pinned?: boolean;
  /** hidden from everyone but admins after this date (ISO) */
  expiresAt?: string;
  status?: LinkStatus;
  /** language code, e.g. "en", "es" */
  lang?: string;
  cost?: "free" | "paid" | "account";
  /** works well on phones */
  mobile?: boolean;
  /** an admin checked it (admin) */
  verified?: boolean;
  sticker?: "hot" | "new" | "essential";
  /** typing this in search + Enter opens the link straight away */
  keyword?: string;
  /** public tip shown on the card, e.g. "sign in with Google first" */
  tip?: string;
  /** extra links that go with this one (article + video…) */
  related?: { name: string; url: string }[];
  /** steps people can tick off */
  checklist?: string[];
  /** also show this link in these folders (no duplicate) */
  alsoIn?: string[];
  /** estimated minutes to read, from the page's word count */
  readMins?: number;
}

export type LinkStatus = "works" | "login" | "slow" | "broken";

export interface Folder {
  id: string;
  name: string;
  emoji: string;
  links: Link[];
  pinned?: boolean;
  color?: string;
  collapsed?: boolean;
  createdAt?: string;
  /** one line under the folder name */
  description?: string;
  /** longer write-up (simple formatting) shown in the folder's guide */
  guide?: string;
  /** sub-folder: lives inside this folder (one level deep) */
  parentId?: string;
  /** groups folders into tabs at the top */
  space?: string;
  /** smart folder: shows every link matching this search instead of its own */
  rule?: string;
  /** hidden from members, kept for admins */
  archived?: boolean;
  /** default order of links (admin) */
  sort?: FolderSort;
  /** lowercase usernames who can manage just this folder */
  maintainers?: string[];
}

export type FolderSort = "manual" | "name" | "newest" | "clicks" | "rating";

export interface ActivityEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
  /** which folder it happened in, for the folder's history */
  folderId?: string;
  by?: string;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  at: string;
  replyTo?: { id: string; user: string; text: string };
  /** emoji -> lowercase usernames (merged in when listing) */
  reactions?: Record<string, string[]>;
}

export type SuggestionKind = "addLink" | "editLink" | "removeLink" | "other";

export interface Suggestion {
  id: string;
  user: string;
  kind: SuggestionKind;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  folderId?: string;
  linkId?: string;
  /** name of the existing link at the time it was suggested */
  linkName?: string;
  name?: string;
  url?: string;
  note?: string;
  resolvedAt?: string;
  resolvedNote?: string;
}

export interface SiteSettings {
  announcement?: string;
  title?: string;
  subtitle?: string;
  /** when true, only admins can add links/folders */
  lockAdding?: boolean;
  /** defaults to true */
  chatEnabled?: boolean;
  theme?: "dark" | "light" | "auto";
  viewMode?: "grid" | "list";
  sortBy?: "name" | "newest" | "clicks" | "manual";
  /** tag -> colour */
  tagColors?: Record<string, string>;
  /** folder shown to first-time visitors */
  startFolderId?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  /** lowercase username -> option index */
  votes: Record<string, number>;
  createdAt: string;
  closed?: boolean;
}

export interface BookmarksData {
  /** bumped on every save so clients can cheaply check for changes */
  rev?: number;
  updatedAt?: string;
  folders: Folder[];
  activity?: ActivityEntry[];
  settings?: SiteSettings;
  polls?: Poll[];
}

export interface Contributor {
  username: string;
  joined?: string;
  added: number;
  likesReceived: number;
  likesGiven: number;
  suggestionsApproved: number;
  messages: number;
  score: number;
}
