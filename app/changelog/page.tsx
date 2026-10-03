"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";

/** Updates to the site itself (not the bookmarks — those are in "What's new"). Newest first. */
const RELEASES: { date: string; title: string; items: string[] }[] = [
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
    </div>
  );
}
