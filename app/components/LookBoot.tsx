"use client";
import { useEffect, useState } from "react";
import { setIconStyle } from "./Icon";
import { Look, applyLook, cleanLook } from "./look";
import { useKonami } from "./Fun";
import { useLeaveWarning } from "./Help";
import { startTranslator } from "./i18n";
import { readLocal } from "./ui";

/**
 * On every page: applies your saved look (the home page also manages it
 * live), keeps other open tabs in step, switches the language, listens for
 * the cheat code, warns before leaving for unknown websites (if you asked),
 * and shows easter-egg messages on pages that don't have their own toasts.
 */
export default function LookBoot() {
  const [msg, setMsg] = useState("");
  const [home, setHome] = useState(true);
  const [leaveWarn, setLeaveWarn] = useState(false);
  useKonami();
  useEffect(() => startTranslator(), []);
  // other pages: the list's websites (from this device's saved copy) count as "known"
  useLeaveWarning(!home && leaveWarn, () => {
    const cached = readLocal<{ folders?: { links?: { url: string }[] }[] } | null>("cache:data", null);
    const hosts = new Set<string>();
    for (const f of cached?.folders || []) for (const l of f.links || []) { try { hosts.add(new URL(l.url).hostname.replace(/^www\./, "")); } catch {} }
    return hosts;
  });
  useEffect(() => {
    const isHome = location.pathname === "/";
    setHome(isHome);
    // the home page does all this itself; embedded widgets follow the host site's ?theme=
    if (isHome || location.pathname.startsWith("/embed/")) return;
    const apply = () => {
      const look = cleanLook(readLocal<Partial<Look>>("look", {}));
      applyLook(look, {
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
        reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      setIconStyle(look.iconStyle);
      setLeaveWarn(look.leaveWarn);
    };
    apply();
    const onStorage = (e: StorageEvent) => { if (e.key === "look") apply(); };
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => { setMsg(String((e as CustomEvent).detail)); clearTimeout(timer); timer = setTimeout(() => setMsg(""), 5000); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("fun-toast", onToast);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("fun-toast", onToast); clearTimeout(timer); };
  }, []);
  if (home || !msg) return null;
  return <div className="toast" role="status">{msg}</div>;
}
