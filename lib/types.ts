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
}

export interface Folder {
  id: string;
  name: string;
  emoji: string;
  links: Link[];
  pinned?: boolean;
  color?: string;
  collapsed?: boolean;
  createdAt?: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
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
