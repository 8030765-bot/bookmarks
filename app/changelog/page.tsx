"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";
import { EasterEgg } from "../components/Fun";

/** Updates to the site itself (not the bookmarks — those are in "What's new"). Newest first. */
const RELEASES: { date: string; title: string; items: string[] }[] = [
  {
    date: "2026-10", title: "Your data",
    items: [
      "Download every folder for Chrome or Edge, a folder as a spreadsheet, or print the list",
      "An “Add from any website” button for your bookmarks bar",
      "The last 7 days at a glance",
      "Put a folder on another website with its embed code; RSS, JSON and calendar feeds",
      "Links you add while offline are sent when you're back online",
      "A warning if someone else changed a link while you were editing it",
      "A peek at each website when you rest the mouse on it",
      "Bring your own settings back from a “Download my data” file",
      "For admins: daily backups, a link checker, a health check, CSV import and merging duplicates",
    ],
  },
  {
    date: "2026-10", title: "Moderation & admin",
    items: [
      "Report a link or a chat message (🚩) and a moderator will look",
      "Moderators can warn, time out, mute or pause edits — with reasons and history",
      "Folders can be locked, limited to contributors, or shown only to members",
      "Admins can switch on approval for new links, invite-only sign-ups and a read-only maintenance mode",
      "Deleted links and folders go to a trash and can be restored",
      "A dashboard with charts, a staff board, and much more for admins",
    ],
  },
  {
    date: "2026-10", title: "Look & feel",
    items: [
      "A new Customize window with a live preview: 14 themes (including Retro 95 and Terminal), any accent colour, backgrounds and dark mode by time of day",
      "Fonts (including a dyslexia-friendly one), text size, weight and line spacing",
      "Card styles, hover effects, an icon-only grid, folder header styles, page width and a folder list down the side",
      "Hide or reorder parts of the homepage; minimal mode with no emoji; emoji or line icons",
      "Share your theme as a code or a link, show it on your profile, and try the admins' theme of the month",
      "High contrast, colourblind-safe colours, always-underlined links, skip-to-content and clearer keyboard focus",
      "“What's this?” mode explains any button, and pages can be read aloud",
      "Seasonal touches, holiday logos, snow in December, fireworks at New Year and an optional sparkle when you click",
      "A greeting, an “On this day” link, a site pet that grows with the site — and a few secrets to find 🥚",
    ],
  },
  {
    date: "2026-10", title: "Tools",
    items: [
      "A tools drawer (press O): focus timer, stopwatch, world clock, countdowns, breathing and a metronome",
      "Private notes, to-do list, habit tracker and flashcards that follow your account",
      "Calculator with a scientific mode, percentages, unit converter, dice, random picker and team maker",
      "Typing speed test with a leaderboard",
      "Word counter, text case, dictionary, binary & Morse, password maker and emoji search",
      "Colour picker, palette maker, sketchpad and pixel art",
      "Word, quote and fact of the day",
      "Pop any tool out into its own window; tools remember where you left off",
      "Private sticky notes on folders",
    ],
  },
  {
    date: "2026-10", title: "Community",
    items: [
      "A new Community page: link requests, Q&A with best answers, tips, shoutouts and a guestbook",
      "Challenges and link of the month, decided by votes",
      "Ideas & roadmap: vote and comment on ideas, and see what's planned",
      "Events calendar, hall of fame and a monthly recap",
      "A small wiki anyone can edit",
      "“Today” strip: link of the day, would-you-rather, a riddle and the next goal",
      "Say thanks to whoever added a link, and add notes everyone can see (checked by a moderator first)",
      "Polls can allow several answers, be anonymous, close on a date, or be the poll of the week",
      "Suggest new folders or changes to a folder",
      "Flair next to people's names",
    ],
  },
  {
    date: "2026-09", title: "Chat",
    items: [
      "Channels and clubs, each with their own folder",
      "Edit and delete messages, threads, polls, reactions, pins and saved messages",
      "Formatting: bold, code, spoilers, maths and link previews",
      "Slash commands, slow mode and a pop-out chat window",
    ],
  },
  {
    date: "2026-09", title: "Notifications",
    items: ["Filters and per-type settings", "Do not disturb", "Phone and desktop push notifications", "A weekly digest"],
  },
  {
    date: "2026-08", title: "Accounts & profiles",
    items: ["Profile pages and a People page", "Follow people and give kudos", "2-step login and an Account & security screen", "Rename, export or delete your account"],
  },
  {
    date: "2026-08", title: "Search & folders",
    items: [
      "Search that forgives typos, with suggestions and voice search",
      "Shareable searches and links to a single card",
      "Sub-folders, spaces, smart folders and folder maintainers",
      "Saved views and tag colours",
    ],
  },
];

export default function ChangelogPage() {
  useEffect(() => { document.title = "Changelog · Theo's Bookmarks"; }, []);
  return (
    <div className="app changelog-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/community"><Icon name="users" /> Community</Link>
      </div>
      <header className="hero">
        <h1>Changelog</h1>
        <p>What’s changed on the site. Have an idea? <Link href="/community?tab=roadmap">Post it on the roadmap</Link>.</p>
      </header>
      <div className="timeline">
        {RELEASES.map((r) => (
          <section key={`${r.date}-${r.title}`} className="release">
            <div className="release-head">
              <strong>{r.title}</strong>
              <span className="muted-inline">{new Date(`${r.date}-01T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>
            <ul>{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        ))}
      </div>
      <p className="center"><EasterEgg id="changelog" /></p>
    </div>
  );
}
