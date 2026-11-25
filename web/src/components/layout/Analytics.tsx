"use client";
/**
 * Loads Plausible (src/lib/analytics.ts) when it is switched on, and counts a page view each time the path changes.
 * Renders nothing. Without NEXT_PUBLIC_PLAUSIBLE_DOMAIN it does nothing at all.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsOn, PLAUSIBLE_DOMAIN, PLAUSIBLE_SRC, trackPageview } from "@/lib/analytics";

let added = false;

export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    if (!analyticsOn) return;
    if (!added) {
      added = true;
      const s = document.createElement("script");
      s.src = PLAUSIBLE_SRC;
      s.defer = true;
      s.dataset.domain = PLAUSIBLE_DOMAIN;
      document.head.appendChild(s);
    }
    trackPageview();
  }, [path]);
  return null;
}
