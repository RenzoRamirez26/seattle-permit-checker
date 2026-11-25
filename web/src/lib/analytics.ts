/**
 * Privacy-friendly, cookieless analytics (Plausible), switched on only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set at
 * build time. Without it nothing loads and track() does nothing.
 * In: a page view (from components/layout/Analytics.tsx) or one of two events.  Out: one request to Plausible.
 * Only the page's path is sent, never its query string or hash: a results link holds the check's id, which opens the
 * check, so it must never leave this site. No answers, addresses, file names or measurements are ever sent.
 */
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";
export const PLAUSIBLE_SRC = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.manual.js";
export const analyticsOn = PLAUSIBLE_DOMAIN !== "";

/** The two events the site counts, besides page views. */
export type AnalyticsEvent = "Check completed" | "Reading corrected";

type Plausible = ((event: string, options?: { u?: string }) => void) & { q?: unknown[] };
declare global {
  interface Window {
    plausible?: Plausible;
  }
}

/** This page's address without its query string or hash. */
export function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function send(event: string): void {
  if (!analyticsOn || typeof window === "undefined") return;
  // Plausible's own queue: calls made before its script has loaded are sent once it has.
  window.plausible ??= Object.assign((...args: unknown[]) => { (window.plausible!.q ??= []).push(args); }, {}) as Plausible;
  window.plausible(event, { u: pageUrl() });
}

export const trackPageview = () => send("pageview");
export const track = (event: AnalyticsEvent) => send(event);
