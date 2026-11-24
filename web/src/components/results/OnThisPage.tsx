"use client";
/**
 * "On this page": where the owner is on the results page and what is left below it.
 * In: the page's sections in order (the element that marks each one, its label, a short label, and what takes focus).
 * Out: a nav landmark that marks the current section (tint, blue Medium text, aria-current="location"), the sections
 * already scrolled past (a grey check and "seen" for screen readers), and the ones still to come (a hollow dot), with
 * "2 of 5 sections seen" at the top. Choosing a section jumps there and moves focus to its heading.
 * At 1024 px and wider it is a sticky white panel (radius 16), 220 px wide, right of the results column; below that, a compact bar at the bottom left, clear of
 * the Ask button, that opens the same list in a popover. The position comes from IntersectionObserver. Nothing moves.
 */
import { useEffect, useState } from "react";
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { Check, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageSection = {
  /** The id of the element that spans the section: its top passing the line makes it the current section. */
  id: string;
  label: string;
  /** For the compact bar's "Next:". */
  short: string;
  /** What takes focus after a jump: the section's heading. */
  target: () => HTMLElement | null;
};

/** A section is current once its top passes this line, this fraction of the way down the window. */
const LINE = 0.3;

/** Which section the owner is in: the last one whose top has passed the line, or the last one at the end of the page. */
export function useCurrentSection(ids: string[], endId: string): number {
  const [current, setCurrent] = useState(0);
  const key = ids.join(" ");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = key.split(" ").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const end = document.getElementById(endId);
    const update = () => {
      const line = window.innerHeight * LINE;
      let c = 0;
      els.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) c = i; });
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd && els.length && els[els.length - 1].getBoundingClientRect().top < window.innerHeight) c = els.length - 1;
      setCurrent(c);
    };
    // The root is the window above the line: a section enters or leaves it as its top crosses the line.
    const atLine = new IntersectionObserver(update, { rootMargin: `0px 0px -${100 - LINE * 100}% 0px` });
    els.forEach((el) => atLine.observe(el));
    const atBottom = new IntersectionObserver(update);
    if (end) atBottom.observe(end);
    const first = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(first);
      atLine.disconnect();
      atBottom.disconnect();
    };
  }, [key, endId]);
  return current;
}

/** Scroll to a section and move focus to its heading. */
export function jumpTo(section: PageSection) {
  const t = section.target();
  if (!t) return;
  t.scrollIntoView({ block: "start" });
  t.focus({ preventScroll: true });
}

function SectionList({ sections, current, onJump }: { sections: PageSection[]; current: number; onJump: (i: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 flex flex-col">
        <span className="font-medium">On this page</span>
        <span className="text-ink-muted nums" data-testid="sections-seen">{current} of {sections.length} sections seen</span>
      </p>
      <ol className="m-0 flex list-none flex-col p-0">
        {sections.map((s, i) => {
          const state = i === current ? "current" : i < current ? "seen" : "next";
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                data-state={state}
                aria-current={state === "current" ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onJump(i);
                }}
                className={cn(
                  "flex min-h-11 items-start gap-2 rounded-full py-2 pr-3 pl-3 no-underline hover:underline",
                  state === "current" ? "bg-tint font-medium text-blue" : "text-ink",
                )}
              >
                <span className="mt-1 flex w-4 shrink-0 justify-center">
                  {state === "seen" ? <Check aria-hidden size={16} strokeWidth={2} className="text-ink-muted" />
                    : state === "next" ? <span aria-hidden className="mt-1 block size-2.5 rounded-full border border-field" />
                      : null}
                </span>
                <span className="min-w-0 break-words">
                  {s.label}
                  {state === "seen" ? <span className="sr-only"> (seen)</span> : null}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The rail beside the results (1024 px and up). */
export function OnThisPageRail({ sections, current }: { sections: PageSection[]; current: number }) {
  return (
    <nav aria-label="On this page" className="results-rail hidden lg:block">
      <div className="pointer-events-auto sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain rounded-2xl border border-hairline bg-white p-4">
        <SectionList sections={sections} current={current} onJump={(i) => jumpTo(sections[i])} />
      </div>
    </nav>
  );
}

/** The compact bar below 1024 px: "Section 2 of 5 · Next: …", opening the list in a popover. */
export function OnThisPageBar({ sections, current }: { sections: PageSection[]; current: number }) {
  const [open, setOpen] = useState(false);
  const next = sections[current + 1];
  const words = `Section ${current + 1} of ${sections.length}${next ? ` · Next: ${next.short}` : " · The last section"}`;
  return (
    <nav aria-label="On this page" className="section-bar lg:hidden">
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        <AriaButton
          aria-label={`On this page: ${words}`}
          className="fixed bottom-4 left-4 right-24 z-30 flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-full border border-field bg-white px-4 py-2 text-left font-medium text-ink data-[hovered]:border-ink data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-blue"
        >
          <span className="nums">{words}</span>
          <ChevronUp aria-hidden size={18} className="shrink-0" />
        </AriaButton>
        <Popover placement="top start" offset={8} className="w-[min(320px,calc(100vw-32px))] rounded-2xl border border-hairline bg-white p-4">
          <Dialog aria-label="On this page" className="outline-none">
            <SectionList sections={sections} current={current} onJump={(i) => {
              setOpen(false);
              // After the popover has closed and given focus back to the bar, jump and move focus to the heading.
              requestAnimationFrame(() => requestAnimationFrame(() => jumpTo(sections[i])));
            }} />
          </Dialog>
        </Popover>
      </DialogTrigger>
    </nav>
  );
}
