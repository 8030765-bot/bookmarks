"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";
import { PasswordStrength, QrCode } from "./People";
import type { Profile } from "./Personal";
import { timeAgo } from "./ui";

interface AccountState {
  username: string;
  createdAt: string;
  twoStep: boolean;
  hasRecoveryCode: boolean;
  previousNames: string[];
  canRenameIn: number;
  sessions: { id: string; device: string; createdAt?: string; current: boolean }[];
  logins: { at: string; device: string; ok: boolean; how?: string }[];
}

type Tab = "security" | "privacy" | "account";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

/** Account & security: password, recovery code, 2-step login, logins, privacy, data, rename, delete. */
export default function AccountModal({
  user,
  profile,
  blocked,
  syncOn,
  onProfile,
  onUnblock,
  onSyncChange,
  onRenamed,
  onDeleted,
  onRecoveryCode,
  toast,
  onClose,
}: {
  user: string;
  profile: Profile;
  blocked: string[];
  syncOn: boolean;
  onProfile: (p: Profile) => Promise<any>;
  onUnblock: (u: string) => void;
  onSyncChange: (on: boolean) => void;
  onRenamed: (newName: string) => void;
  onDeleted: () => void;
  onRecoveryCode: (code: string) => void;
  toast: (msg: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("security");
  const [info, setInfo] = useState<AccountState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch("/api/me?account=1", { cache: "no-store" }).then((r) => r.json()).then((j) => j.username && setInfo(j)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e: any) { setError(e.message || "Something went wrong"); } finally { setBusy(false); }
  }

  // password
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  // recovery code + 2-step
  const [pw2, setPw2] = useState("");
  const [pwR, setPwR] = useState("");
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  // rename + delete
  const [newName, setNewName] = useState("");
  const [renamePw, setRenamePw] = useState("");
  const [deletePw, setDeletePw] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal wide account-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Account & security</h2>
        <div className="seg">
          <button className={tab === "security" ? "on" : ""} onClick={() => { setTab("security"); setError(""); }}>Security</button>
          <button className={tab === "privacy" ? "on" : ""} onClick={() => { setTab("privacy"); setError(""); }}>Privacy</button>
          <button className={tab === "account" ? "on" : ""} onClick={() => { setTab("account"); setError(""); }}>Your data</button>
        </div>
        {error && <div className="field-warn account-error">{error}</div>}
        {!info && <div className="skeleton skel-row" />}

        {info && tab === "security" && (
          <>
            <div className="admin-h">Change password</div>
            <form className="acct-form" onSubmit={(e) => { e.preventDefault(); run(async () => {
              const j = await post({ action: "changePassword", oldPassword: oldPw, newPassword: newPw });
              setOldPw(""); setNewPw("");
              toast(j.signedOut ? `Password changed — signed out ${j.signedOut} other device${j.signedOut === 1 ? "" : "s"}` : "Password changed");
              load();
            }); }}>
              <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Current password" autoComplete="current-password" required />
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" autoComplete="new-password" minLength={6} required />
              <PasswordStrength password={newPw} />
              <button className="btn btn-secondary btn-sm" disabled={busy}>Change password</button>
              <div className="hint">Your other devices get signed out.</div>
            </form>

            <div className="admin-h">2-step login</div>
            {info.twoStep ? (
              <div className="acct-form">
                <p className="modal-text">✅ On. Logging in needs your password and a code from your authenticator app.</p>
                <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Password to turn it off" />
                <button className="btn btn-danger btn-sm" disabled={busy || !pw2} onClick={() => run(async () => { await post({ action: "disableTotp", password: pw2 }); setPw2(""); toast("2-step login turned off"); load(); })}>Turn off</button>
              </div>
            ) : totp ? (
              <div className="acct-form totp-setup">
                <p className="modal-text">Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…), then type the 6-digit code it shows.</p>
                <QrCode text={totp.uri} />
                <code className="totp-secret">{totp.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
                <div className="row-edit-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => { setTotp(null); setCode(""); }}>Cancel</button>
                  <button className="btn btn-primary btn-sm" disabled={busy || code.length !== 6} onClick={() => run(async () => { await post({ action: "confirmTotp", code }); setTotp(null); setCode(""); setPw2(""); toast("2-step login is on"); load(); })}>Turn on</button>
                </div>
              </div>
            ) : (
              <div className="acct-form">
                <p className="modal-text">Off. With it on, someone who learns your password still can&apos;t log in without your phone.</p>
                <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Your password" />
                <button className="btn btn-secondary btn-sm" disabled={busy || !pw2} onClick={() => run(async () => { setTotp(await post({ action: "startTotp", password: pw2 })); })}>Set up</button>
              </div>
            )}

            <div className="admin-h">Recovery code</div>
            <div className="acct-form">
              <p className="modal-text">{info.hasRecoveryCode ? "You have one. Lost it? Make a new one (the old one stops working)." : "You don't have one yet — make one so you can get back in if you forget your password."}</p>
              <input type="password" value={pwR} onChange={(e) => setPwR(e.target.value)} placeholder="Your password" />
              <button className="btn btn-secondary btn-sm" disabled={busy || !pwR} onClick={() => run(async () => { const j = await post({ action: "newRecoveryCode", password: pwR }); setPwR(""); onRecoveryCode(j.recoveryCode); load(); })}>
                New recovery code
              </button>
            </div>

            <div className="admin-h">Where you&apos;re logged in</div>
            <div className="admin-list">
              {info.sessions.map((s) => (
                <div key={s.id} className="admin-row">
                  <Icon name="user" />
                  <div className="row-main">
                    <div className="row-title">{s.device}{s.current && <span className="pill approved">this device</span>}</div>
                    <div className="row-sub">{s.createdAt ? `since ${timeAgo(s.createdAt)}` : ""}</div>
                  </div>
                  {!s.current && <button className="btn btn-secondary btn-sm" onClick={() => run(async () => { await post({ action: "revokeSession", id: s.id }); toast("Signed out that device"); load(); })}>Sign out</button>}
                </div>
              ))}
            </div>
            {info.sessions.length > 1 && (
              <button className="btn btn-secondary btn-sm mt" onClick={() => run(async () => { const j = await post({ action: "logoutEverywhere" }); toast(`Signed out ${j.ended} other device${j.ended === 1 ? "" : "s"}`); load(); })}>
                Sign out everywhere else
              </button>
            )}

            <div className="admin-h">Recent logins</div>
            <div className="admin-list">
              {info.logins.length === 0 && <div className="admin-empty">Nothing yet.</div>}
              {info.logins.slice(0, 8).map((l, i) => (
                <div key={i} className="admin-row">
                  <span className={`status-dot ${l.ok ? "good" : "bad"}`} />
                  <div className="row-main">
                    <div className="row-title">{l.ok ? "Logged in" : "Failed login"} · {l.device}</div>
                    <div className="row-sub">{timeAgo(l.at)}{l.how ? ` · ${l.how}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="hint">Not you? Change your password and sign out everywhere else.</p>
          </>
        )}

        {info && tab === "privacy" && (
          <>
            <div className="admin-h">Who can see your profile</div>
            <div className="seg">
              {(["everyone", "members", "private"] as const).map((v) => (
                <button key={v} className={(profile.visibility || "everyone") === v ? "on" : ""} onClick={() => onProfile({ visibility: v })}>
                  {v === "everyone" ? "Everyone" : v === "members" ? "Logged-in members" : "Only me"}
                </button>
              ))}
            </div>
            <label className="toggle-row compact">
              <div><strong>Hide when I&apos;m online</strong><span>You won&apos;t show in the online list or as &quot;active 5 min ago&quot;.</span></div>
              <input type="checkbox" role="switch" checked={!!profile.hideOnline} onChange={(e) => onProfile({ hideOnline: e.target.checked })} />
              <span className="switch" aria-hidden="true" />
            </label>
            <label className="toggle-row compact">
              <div><strong>Sync my settings</strong><span>Your theme, layout and sort follow you to other devices.</span></div>
              <input type="checkbox" role="switch" checked={syncOn} onChange={(e) => onSyncChange(e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
            <div className="admin-h">Blocked</div>
            {blocked.length === 0 ? (
              <div className="admin-empty">You haven&apos;t blocked anyone. Block someone from their chat messages or profile to hide what they write.</div>
            ) : (
              <div className="admin-list">
                {blocked.map((b) => (
                  <div key={b} className="admin-row">
                    <div className="row-main"><div className="row-title">{b}</div></div>
                    <button className="btn btn-secondary btn-sm" onClick={() => onUnblock(b)}>Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {info && tab === "account" && (
          <>
            <div className="admin-h">Download my data</div>
            <p className="modal-text">Everything the site stores about you — profile, favorites, ratings, notes, settings, logins — as one file.</p>
            <a className="btn btn-secondary btn-sm" href="/api/me?export=1" download><Icon name="download" /> Download</a>

            <div className="admin-h">Change username</div>
            {info.previousNames.length > 0 && <p className="hint">Used to be: {info.previousNames.join(", ")}</p>}
            {info.canRenameIn > 0 ? (
              <p className="modal-text">You can change it again in {info.canRenameIn} day{info.canRenameIn === 1 ? "" : "s"}.</p>
            ) : (
              <form className="acct-form" onSubmit={(e) => { e.preventDefault(); run(async () => {
                const j = await post({ action: "rename", newName, password: renamePw });
                toast(`You're now ${j.user}`); setNewName(""); setRenamePw(""); onRenamed(j.user); load();
              }); }}>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New username" maxLength={20} pattern="[A-Za-z0-9_]{3,20}" required />
                <input type="password" value={renamePw} onChange={(e) => setRenamePw(e.target.value)} placeholder="Your password" required />
                <button className="btn btn-secondary btn-sm" disabled={busy}>Change username</button>
                <div className="hint">Your links, likes and followers move with you. You can do this once every 30 days.</div>
              </form>
            )}

            <div className="admin-h danger-h">Delete my account</div>
            <div className="danger-zone acct-delete">
              <p className="modal-text">This removes your account, profile, favorites, notes and settings. Websites you added stay on the site. It can&apos;t be undone.</p>
              <input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} placeholder="Your password" />
              <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={`Type ${user} to confirm`} />
              <button className="btn btn-danger btn-sm" disabled={busy || !deletePw || deleteConfirm !== user}
                onClick={() => run(async () => { await post({ action: "deleteAccount", password: deletePw }); onDeleted(); })}>
                Delete my account
              </button>
            </div>
          </>
        )}
        <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
