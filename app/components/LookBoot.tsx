"use client";
import { useEffect, useState } from "react";
import { setIconStyle } from "./Icon";
import { Look, applyLook, cleanLook } from "./look";
import { useKonami } from "./Fun";
import { readLocal } from "./ui";

/**
 * On every page: applies your saved look (the home page also manages it
 * live), keeps other open tabs in step, listens for the cheat code, and
 * shows easter-egg messages on pages that don't have their own toasts.
 */
export default function LookBoot() {
  const [msg, setMsg] = useState("");
  const [home, setHome] = useState(true);
  useKonami();
  useEffect(() => {
    const isHome = location.pathname === "/";
    setHome(isHome);
    if (isHome) return; // the home page does all this itself
    const apply = () => {
      const look = cleanLook(readLocal<Partial<Look>>("look", {}));
      applyLook(look, {
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
        reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
      setIconStyle(look.iconStyle);
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
