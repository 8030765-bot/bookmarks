"use client";
import { useEffect, useState } from "react";
import ChatPanel from "../ChatPanel";
import { useSyncLoop } from "../components/sync";
import { usePresence } from "../components/Community";

/** Chat on its own (the "pop out" window). */
export default function ChatPage() {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  useEffect(() => {
    document.title = "Chat · Theo's Bookmarks";
    fetch("/api/auth", { cache: "no-store" }).then((r) => r.json()).then((j) => { setUser(j.user || null); setRole(j.role || null); }).catch(() => {});
  }, []);
  useSyncLoop(user);
  const presence = usePresence(user);
  const show = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2800); };
  return (
    <div className="chat-page">
      <ChatPanel
        open
        setOpen={() => {}}
        chatEnabled
        user={user}
        online={presence.users}
        adminPassword={null}
        canModerate={!!role}
        isAdmin={role === "owner" || role === "admin"}
        onNeedLogin={() => { location.href = "/"; }}
        showToast={show}
        fullPage
      />
      {toast && <div className="toast" role="status"><span>{toast}</span></div>}
    </div>
  );
}
