"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "../components/Icon";

/** What the site keeps about you, in plain words. */
export default function PrivacyPage() {
  useEffect(() => { document.title = "Privacy · Theo's Bookmarks"; }, []);
  return (
    <div className="app doc-page">
      <div className="pp-top">
        <Link className="btn btn-secondary btn-sm" href="/"><Icon name="up" /> Bookmarks</Link>
        <Link className="btn btn-secondary btn-sm" href="/help">Help</Link>
      </div>
      <main id="main" className="doc">
        <h1>Privacy</h1>
        <p>This is a small school site. Here&apos;s everything it keeps, and why.</p>

        <h2>If you don&apos;t log in</h2>
        <ul>
          <li>Nothing about you is saved on the server. Visit counts are just numbers, not linked to you.</li>
          <li>Your settings (theme, layout, what you&apos;ve hidden) stay in your own browser.</li>
          <li>To stop people being tracked down, visitors who aren&apos;t logged in don&apos;t see who added or liked things.</li>
        </ul>

        <h2>If you make an account</h2>
        <ul>
          <li><strong>Your username</strong> and a scrambled (hashed) password — nobody, not even admins, can read your password.</li>
          <li><strong>What you share on purpose:</strong> links you add, chat messages, posts, ratings, likes and your profile.</li>
          <li><strong>Your private things:</strong> favorites, notes, read-later, tool notes, flashcards and to-dos. Only you can see these.</li>
          <li><strong>Logins:</strong> which kind of device and when, so you can spot a login that wasn&apos;t you (Account &amp; security).</li>
          <li><strong>Notifications</strong> — they clear themselves after a while.</li>
        </ul>

        <h2>What admins can see</h2>
        <ul>
          <li>Usernames, when accounts were made and last active, and anything posted publicly.</li>
          <li>Reports, bug reports and messages sent to them.</li>
          <li>Admins <strong>can&apos;t</strong> see your password, your private notes, your favorites or your tools.</li>
        </ul>

        <h2>Other companies</h2>
        <ul>
          <li>Website icons come from Google&apos;s favicon service; optional fonts come from Google Fonts.</li>
          <li>If an admin turns it on, new links are checked against Google&apos;s list of dangerous sites.</li>
          <li>The dictionary tool looks words up at dictionaryapi.dev.</li>
          <li>The site is hosted on Vercel and the data is kept in an Upstash database.</li>
          <li>There are no adverts and nothing is sold.</li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li><strong>Download my data</strong> and <strong>Delete my account</strong> are in Account &amp; security. Deleting removes your account and private data.</li>
          <li>Hide your profile or your online status in your profile settings.</li>
          <li>Questions? <Link href="/help#contact">Message an admin</Link>.</li>
        </ul>
      </main>
    </div>
  );
}
