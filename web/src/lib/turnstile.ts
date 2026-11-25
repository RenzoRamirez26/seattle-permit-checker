/**
 * Optional Cloudflare Turnstile, so a script cannot spend the site's model calls. Switched on only when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set at build time (and PERMIT_TURNSTILE_SECRET on the API). Without it nothing
 * loads and turnstileHeaders() returns no header.
 * In: a request about to be sent (an uploaded plan to read, a question to the assistant).
 * Out: { "cf-turnstile-response": token } for that one request. Each token is used once, so each request asks for a
 * new one. The widget only shows when Cloudflare needs the person to do something ("interaction-only").
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const turnstileOn = TURNSTILE_SITE_KEY !== "";
const SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
export const TURNSTILE_BOX = "turnstile-box";

type Widget = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Widget;
  }
}

let loading: Promise<Widget> | null = null;

function load(): Promise<Widget> {
  loading ??= new Promise<Widget>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** The header for one request: a fresh Turnstile token, or {} when Turnstile is off or could not run (the API then
 * answers verification_needed, which the page words for the owner). */
export async function turnstileHeaders(): Promise<Record<string, string>> {
  if (!turnstileOn) return {};
  try {
    const widget = await load();
    const box = document.getElementById(TURNSTILE_BOX);
    if (!box) return {};
    const holder = document.createElement("div");
    box.appendChild(holder);
    const token = await new Promise<string>((resolve) => {
      const done = (t: string) => {
        widget.remove(id);
        holder.remove();
        resolve(t);
      };
      const id = widget.render(holder, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: "interaction-only",
        callback: (t: string) => done(t),
        "error-callback": () => done(""),
        "expired-callback": () => done(""),
        "timeout-callback": () => done(""),
      });
    });
    return token ? { "cf-turnstile-response": token } : {};
  } catch {
    return {};
  }
}
