"use client";
import { useCallback, useEffect, useState } from "react";
import { BookmarksData } from "@/lib/types";
import { Icon } from "./Icon";
import Favicon from "./Favicon";
import { setFlairMap } from "./People";
import { useOnRevChange } from "./sync";
import { LinkRef, readLocal, safeHref, writeLocal } from "./ui";
import { dayIndex, dayKey, todaysRiddle, todaysWyr } from "./daily";

export interface CommunityInfo {
  helpers: { username: string; answers: number; accepted: number; helpful: number }[];
  flair: Record<string, string>;
  thanks: Record<string, number>;
  myThanks: string[];
  myPolls: Record<string, number[]>;
  newMembers: string[];
  events: { id: string; title: string; date: string; endDate?: string; description?: string }[];
  wyr: { day: string; a: number; b: number; mine: number | null };
  goals: Record<"links" | "members" | "messages", { now: number; goal: number }>;
}

/** Community extras shared by the main page: flair, thanks, the daily question, goals… */
export function useCommunityInfo(user: string | null) {
  const [info, setInfo] = useState<CommunityInfo | null>(null);
  const load = useCallback(() => {
    fetch("/api/community", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.goals) return;
        setInfo(j);
        setFlairMap(j.flair || {});
      })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, user]);
  useOnRevChange("suggestions", load);
  const patch = useCallback((p: Partial<CommunityInfo>) => setInfo((i) => (i ? { ...i, ...p } : i)), []);
  return { info, patch, reload: load };
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}
export const sayThanks = (linkId: string) => post({ action: "thank", linkId });
export const suggestNote = (linkId: string, text: string) => post({ action: "note", linkId, text });

/**
 * The "Today" strip under the header: link of the day, would-you-rather,
 * a riddle, the site's birthday, the featured folder or person, and a goal.
 * Small and folded away with one click.
 */
export function TodayStrip({ data, allRefs, user, community, onOpenLink, onOpenFolder, onNeedLogin, onError }: {
  data: BookmarksData;
  allRefs: LinkRef[];
  user: string | null;
  community: ReturnType<typeof useCommunityInfo>;
  onOpenLink: (linkId: string) => void;
  onOpenFolder: (folderId: string) => void;
  onNeedLogin: () => void;
  onError: (msg: string) => void;
}) {
  const [hidden, setHidden] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  useEffect(() => { setHidden(readLocal("todayHidden", "") === dayKey()); }, []);
  const s = data.settings || {};
  const info = community.info;
  const today = dayKey();

  // link of the day: an admin's pick for today, otherwise one picked from the list by date
  const pool = allRefs.filter((r) => safeHref(r.link.url) && !r.folder.archived);
  const picked = s.linkOfDay?.day === today ? allRefs.find((r) => r.link.id === s.linkOfDay!.linkId) : undefined;
  const lotd = picked || (pool.length ? pool[(dayIndex() * 31) % pool.length] : undefined);

  const [a, b] = todaysWyr();
  const wyr = info?.wyr?.day === today ? info.wyr : null;
  const riddle = todaysRiddle();
  const birthday = (() => {
    if (!s.siteBirthday) return null;
    const [y, m, d] = s.siteBirthday.split("-").map(Number);
    const now = new Date();
    if (now.getMonth() + 1 !== m || now.getDate() !== d) return null;
    return now.getFullYear() - y;
  })();
  const featuredFolder = s.featuredFolderId ? data.folders.find((f) => f.id === s.featuredFolderId) : undefined;
  const goal = info?.goals.links;

  if (hidden) {
    return (
      <button className="today-show" onClick={() => { setHidden(false); writeLocal("todayHidden", ""); }}>
        <Icon name="sun" /> Show today’s stuff
      </button>
    );
  }

  const voteWyr = async (choice: 0 | 1) => {
    if (!user) return onNeedLogin();
    if (wyr) {
      // show the new split straight away
      const next = { ...wyr, mine: choice, a: wyr.a + (choice === 0 ? 1 : 0) - (wyr.mine === 0 ? 1 : 0), b: wyr.b + (choice === 1 ? 1 : 0) - (wyr.mine === 1 ? 1 : 0) };
      community.patch({ wyr: next });
    }
    try {
      const j = await post({ action: "wyr", choice });
      community.patch({ wyr: j.wyr });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save your answer");
    }
  };
  const total = wyr ? wyr.a + wyr.b : 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <section className="today" aria-label="Today">
      <div className="today-head">
        <span className="today-title"><Icon name="sun" /> Today</span>
        <a className="today-more" href="/community">Community</a>
        <button className="today-x" title="Hide for today" onClick={() => { setHidden(true); writeLocal("todayHidden", today); }}><Icon name="x" /></button>
      </div>
      <div className="today-row">
        {birthday !== null && birthday > 0 && (
          <div className="today-tile birthday">
            <span className="tt-label">🎂 Happy birthday!</span>
            <span className="tt-main">The site turns {birthday} today</span>
          </div>
        )}
        {lotd && (
          <div className="today-tile">
            <span className="tt-label">🔗 Link of the day</span>
            <a className="tt-main tt-link" href={lotd.link.url} target="_blank" rel="noopener noreferrer">
              <Favicon url={lotd.link.url} name={lotd.link.name} size={16} /> {lotd.link.name}
            </a>
            <button className="tt-sub" onClick={() => onOpenLink(lotd.link.id)}>in {lotd.folder.emoji} {lotd.folder.name}</button>
          </div>
        )}
        <div className="today-tile wyr">
          <span className="tt-label">🤔 Would you rather…</span>
          <div className="wyr-opts">
            {[a, b].map((text, i) => {
              const mine = wyr?.mine === i;
              const n = i === 0 ? wyr?.a || 0 : wyr?.b || 0;
              return (
                <button key={i} className={`wyr-opt ${mine ? "mine" : ""}`} onClick={() => voteWyr(i as 0 | 1)} aria-pressed={mine}>
                  {wyr?.mine != null && <span className="wyr-fill" style={{ width: `${pct(n)}%` }} />}
                  <span className="wyr-text">{text}</span>
                  {wyr?.mine != null && <span className="wyr-pct">{pct(n)}%</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="today-tile">
          <span className="tt-label">🧩 Riddle</span>
          <span className="tt-main small">{riddle.q}</span>
          <button className="tt-sub" onClick={() => setShowAnswer((v) => !v)}>{showAnswer ? riddle.a : "Show the answer"}</button>
        </div>
        {s.challenge && (
          <a className="today-tile" href="/community?tab=challenge">
            <span className="tt-label">🏁 Challenge</span>
            <span className="tt-main small">{s.challenge.title}</span>
            <span className="tt-sub">Enter or vote →</span>
          </a>
        )}
        {featuredFolder ? (
          <button className="today-tile" onClick={() => onOpenFolder(featuredFolder.id)}>
            <span className="tt-label">⭐ Featured folder</span>
            <span className="tt-main">{featuredFolder.emoji} {featuredFolder.name}</span>
            <span className="tt-sub">{featuredFolder.links.length} websites</span>
          </button>
        ) : s.featuredUser ? (
          <a className="today-tile" href={`/u/${encodeURIComponent(s.featuredUser)}`}>
            <span className="tt-label">⭐ Featured person</span>
            <span className="tt-main">@{s.featuredUser}</span>
            <span className="tt-sub">See their profile →</span>
          </a>
        ) : null}
        {goal && (
          <div className="today-tile">
            <span className="tt-label">🎯 Next goal</span>
            <span className="tt-main small">{goal.now} / {goal.goal} websites</span>
            <span className="goal-bar"><span style={{ width: `${Math.min(100, Math.round((goal.now / goal.goal) * 100))}%` }} /></span>
          </div>
        )}
      </div>
    </section>
  );
}
