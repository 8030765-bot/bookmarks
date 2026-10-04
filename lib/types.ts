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
  /** context added by members and approved by admins */
  communityNotes?: { text: string; by: string; at: string }[];
  /** admin: only appears to members from this date (ISO) */
  showAt?: string;
}

export type LinkStatus = "works" | "login" | "slow" | "broken";

/** Who can do what in one folder (missing = the site's normal rules). */
export interface FolderPerm {
  add?: "everyone" | "contributors" | "admins";
  edit?: "maintainers" | "admins";
  view?: "everyone" | "members";
}
export interface Folder {
  perm?: FolderPerm;
  /** last edit (for "someone else changed this" warnings) */
  updatedAt?: string;
  /** admin: only appears to members from this date (ISO) */
  showAt?: string;
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
  /** belongs to a club: its members can manage the links */
  clubId?: string;
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
  channel?: string;
  edited?: boolean;
  /** "me" = /me action, "announce" = highlighted admin message, "poll", "roll" = dice result */
  kind?: "text" | "me" | "announce" | "poll" | "roll" | "system";
  poll?: { question: string; options: string[]; votes?: Record<string, string[]>; closed?: boolean };
  /** a #help question someone marked as answered */
  answered?: boolean;
  /** how many replies point at this message (merged in when listing) */
  replies?: number;
}

export interface ChatChannel {
  id: string;
  name: string;
  emoji: string;
  topic?: string;
  /** shown pinned at the top of the channel */
  rules?: string;
  /** seconds people must wait between messages */
  slow?: number;
  /** a club's private-ish channel (members, plus moderators) */
  clubId?: string;
  createdAt?: string;
}

export interface Club {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  owner: string;
  /** lowercase usernames */
  members: string[];
  /** the club's shared folder */
  folderId?: string;
  /** anyone can join (otherwise the owner adds people) */
  open: boolean;
  createdAt: string;
}

export type SuggestionKind = "addLink" | "editLink" | "removeLink" | "other" | "newFolder" | "editFolder";

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
  /** folder suggestions */
  emoji?: string;
  description?: string;
  /** lowercase usernames who upvoted it */
  votes?: string[];
  comments?: { id: string; user: string; text: string; at: string }[];
  /** roadmap stage for site ideas (set by admins) */
  stage?: "planned" | "in progress" | "done";
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
  /** chat: extra :shortcodes: (name -> emoji or text) */
  chatShortcodes?: Record<string, string>;
  /** chat: if set, links are only allowed to these websites */
  chatLinkAllow?: string[];
  /** chat: longest message allowed */
  chatMaxLen?: number;
  /** community: the person and folder on the homepage spotlight */
  featuredUser?: string;
  featuredFolderId?: string;
  /** community: link of the day picked by an admin (otherwise picked automatically) */
  linkOfDay?: { linkId: string; day: string };
  /** community: this week's challenge */
  challenge?: { title: string; text?: string; round: string; endsAt?: string };
  /** community: the site's birthday (YYYY-MM-DD) for the yearly celebration */
  siteBirthday?: string;
  /** look: the theme new visitors start with (a theme code) */
  defaultTheme?: string;
  /** look: an admin-picked theme people can try this month */
  themeOfMonth?: { code: string; name: string };
  /** fun: April Fools mode, switched on by an admin */
  aprilFools?: boolean;
  /** admin: read-only mode, with a banner */
  maintenance?: boolean;
  maintenanceMessage?: string;
  signups?: "open" | "closed" | "invite";
  approveLinks?: boolean;
  newAccountWait?: boolean;
  rateScale?: number;
  blockedNames?: string[];
  wordFilter?: string[];
  modPerms?: Record<string, boolean>;
  betaFlags?: string[];
  pollsEnabled?: boolean;
  suggestionsEnabled?: boolean;
  communityEnabled?: boolean;
  /** ready-made reasons for declining a suggestion */
  rejectReasons?: string[];
  /** quick folder + tags to use when approving a link */
  approveTemplates?: { name: string; folderId: string; tags: string[] }[];
  /** the site rules new members agree to (Markdown); a sensible default is used when empty */
  rules?: string;
  /** the announcement only shows between these times (ISO) */
  announceFrom?: string;
  announceUntil?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  /** lowercase username -> option index (or indexes, for multiple-choice) — empty for anonymous polls */
  votes: Record<string, number | number[]>;
  createdAt: string;
  closed?: boolean;
  /** pick more than one answer */
  multi?: boolean;
  /** stops taking votes after this (ISO) */
  endsAt?: string;
  /** who voted for what isn't stored in the shared list, only the totals */
  anonymous?: boolean;
  /** totals for anonymous polls */
  counts?: number[];
  /** "poll of the week": shown first */
  featured?: boolean;
}

export interface BookmarksData {
  /** data format version, so older saved copies can be upgraded when read */
  schema?: number;
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
