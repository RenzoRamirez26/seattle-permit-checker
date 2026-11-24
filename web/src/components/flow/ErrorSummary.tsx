"use client";
/** The box at the top of a page listing each error as a link to its field (brief section 6). */
import { forwardRef } from "react";
import { AlertCircle } from "lucide-react";

export type ProblemItem = { id?: string; text: string; href?: string; action?: React.ReactNode };

export const ErrorSummary = forwardRef<HTMLDivElement, { title?: string; items: ProblemItem[] }>(function ErrorSummary(
  { title = "There is a problem", items },
  ref,
) {
  if (!items.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="mb-8 border-2 border-fix bg-fix-tint p-4 outline-offset-4">
      <h2 id="error-summary-title" className="m-0 flex items-center gap-2 text-section-heading text-fix">
        <AlertCircle aria-hidden size={24} strokeWidth={2} />
        {title}
      </h2>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {items.map((item, i) => (
          <li key={item.id ?? i}>
            {item.href ? (
              <a href={item.href} className="font-semibold text-fix" onClick={(e) => focusTarget(e, item.href!)}>
                {item.text}
              </a>
            ) : (
              <span className="font-semibold text-fix">{item.text}</span>
            )}
            {item.action ? <span className="ml-2">{item.action}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
});

function focusTarget(e: React.MouseEvent, href: string) {
  if (!href.startsWith("#")) return;
  const el = document.getElementById(href.slice(1));
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ block: "center" });
  // The id may be on the field's wrapper: focus the control inside it (an input, the chosen radio, or the first one).
  const control = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input:not([type=radio]), textarea, select, input[type=radio]:checked, input[type=radio], button");
  (control ?? (el as HTMLElement)).focus();
}
