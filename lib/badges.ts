/**
 * Badges people earn just by using the site. Worked out from stats every
 * time a profile is opened (nothing extra is stored); people can pick up to
 * three to show next to their name.
 */
export interface BadgeDef { id: string; emoji: string; name: string; how: string }
export const BADGES: BadgeDef[] = [
  { id: "first-link", emoji: "🌱", name: "First find", how: "Add your first website" },
  { id: "collector", emoji: "📚", name: "Collector", how: "Add 10 websites" },
  { id: "curator", emoji: "🏛️", name: "Curator", how: "Add 50 websites" },
  { id: "liked", emoji: "❤️", name: "Liked", how: "Get 10 likes on websites you added" },
  { id: "popular", emoji: "🔥", name: "Popular", how: "Get 50 likes on websites you added" },
  { id: "kudos", emoji: "⭐", name: "Star", how: "Get 5 kudos" },
  { id: "followed", emoji: "👥", name: "Followed", how: "Have 10 followers" },
  { id: "critic", emoji: "🎬", name: "Critic", how: "Rate 20 websites" },
  { id: "early", emoji: "🐣", name: "Early bird", how: "Be one of the first 25 accounts" },
  { id: "veteran", emoji: "🎂", name: "Veteran", how: "Have an account for a year" },
  { id: "staff", emoji: "🛡️", name: "Team", how: "Help run the site" },
];

export interface BadgeStats {
  added: number;
  likes: number;
  kudos: number;
  followers: number;
  ratings: number;
  /** 0 = the first account ever made */
  signupRank: number;
  joined?: string;
  role?: string | null;
}

export function earnedBadges(s: BadgeStats): string[] {
  const days = s.joined ? (Date.now() - Date.parse(s.joined)) / 86400_000 : 0;
  const got: Record<string, boolean> = {
    "first-link": s.added >= 1,
    collector: s.added >= 10,
    curator: s.added >= 50,
    liked: s.likes >= 10,
    popular: s.likes >= 50,
    kudos: s.kudos >= 5,
    followed: s.followers >= 10,
    critic: s.ratings >= 20,
    early: s.signupRank >= 0 && s.signupRank < 25,
    veteran: days >= 365,
    staff: s.role === "owner" || s.role === "admin" || s.role === "mod",
  };
  return BADGES.filter((b) => got[b.id]).map((b) => b.id);
}

export const badgeById = (id: string) => BADGES.find((b) => b.id === id);
