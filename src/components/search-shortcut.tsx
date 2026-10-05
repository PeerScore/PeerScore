"use client";

import { useEffect } from "react";

/** Focuses the header search when "/" is pressed outside an input. */
export function SearchShortcut({ targetId }: { targetId: string }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const el = document.getElementById(targetId) as HTMLInputElement | null;
      if (el) {
        e.preventDefault();
        el.focus();
        el.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [targetId]);
  return null;
}
