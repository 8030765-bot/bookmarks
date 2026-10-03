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
}

export interface SiteSettings {
  announcement?: string;
  theme?: "dark" | "light" | "auto";
  viewMode?: "grid" | "list";
  sortBy?: "name" | "newest" | "clicks" | "manual";
}

export interface BookmarksData {
  folders: Folder[];
  activity?: ActivityEntry[];
  settings?: SiteSettings;
}
