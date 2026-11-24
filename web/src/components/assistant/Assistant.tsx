"use client";
/**
 * The assistant (brief section 8): a round "Ask" button fixed at the bottom right, opening a side panel in
 * columns 9 to 12 on wide screens (the page reflows so nothing is covered) or a sheet from the bottom on phones.
 * Before a result exists it answers from the fixed help text only, with no request. Once a check exists it sends
 * the question to POST /api/checks/{id}/ask, which answers from the result only (agent.check_grounded()).
 * Answers are text, never HTML; each links to the finding(s) it cites. It never opens by itself.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { MessageCircleQuestion, X } from "lucide-react";
import { api, ApiProblem, call, loadCheck, type Check } from "@/api/client";
import { errorWords } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { findingAnchor } from "@/components/results/FindingCard";
import { look } from "@/components/results/status";
import { useMeta } from "@/components/layout/Providers";
import { BEFORE_RESULT, CAN_AND_CANNOT, HELP, matchHelp, RESULT_SUGGESTIONS, SUGGESTIONS } from "@/content/help";
import { useHydrated } from "@/lib/hydrated";
import { assistant, type Message } from "@/state/assistant";
import { flow } from "@/state/flow";

const WIDE = "(min-width: 64rem)";

function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const stepOf = (path: string) =>
  path.startsWith("/business") ? "business" : path.startsWith("/plan") ? "plan" : path.startsWith("/check") ? "check" : path.startsWith("/help") ? "help" : path.startsWith("/results") ? "results" : "start";

export function Assistant() {
  const hydrated = useHydrated();
  return hydrated ? <AssistantInner /> : null;
}

function AssistantInner() {
  const s = useSyncExternalStore(assistant.subscribe, assistant.get, assistant.get);
  const wide = useWide();
  const askRef = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const urlCheck = useSearchParams().get("check");
  const checkId = path.startsWith("/results") ? urlCheck : flow.checkId();

  const close = useCallback(() => {
    assistant.close();
    requestAnimationFrame(() => askRef.current?.focus());
  }, []);

  // On a wide screen the page makes room for the panel instead of being covered by it.
  useEffect(() => {
    document.body.dataset.assistant = s.open && wide ? "open" : "closed";
  }, [s.open, wide]);

  return (
    <>
      <AskButton ref={askRef} hidden={s.open} />
      {wide ? (
        <SidePanel open={s.open} onClose={close}>
          <PanelBody step={stepOf(path)} checkId={checkId} onClose={close} closeOnLink={false} />
        </SidePanel>
      ) : (
        <ModalOverlay isOpen={s.open} onOpenChange={(o) => !o && close()} isDismissable
          className="fixed inset-0 z-50 overscroll-contain bg-ink/40">
          <Modal className="sheet fixed inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-sm border-t border-ink bg-paper pb-[env(safe-area-inset-bottom)]">
            <Dialog aria-labelledby="assistant-title" className="flex min-h-0 flex-1 flex-col outline-none">
              <PanelBody step={stepOf(path)} checkId={checkId} onClose={close} closeOnLink />
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
}

/**
 * The round Ask button. Closed, it never covers the page's main button: when a main button
 * ([data-main-action]) would pass under it, it sits just above that button instead.
 */
function AskButton({ ref, hidden }: { ref: React.Ref<HTMLButtonElement>; hidden: boolean }) {
  const [lift, setLift] = useState(0);
  const own = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const me = own.current;
        if (!me) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        const size = me.offsetWidth, gap = 16;
        const home = { left: vw - gap - size, right: vw - gap, top: vh - gap - size, bottom: vh - gap };
        let needed = 0;
        for (const el of document.querySelectorAll<HTMLElement>("[data-main-action]")) {
          const r = el.getBoundingClientRect();
          if (!r.width) continue;
          const across = r.right > home.left - 8 && r.left < home.right + 8;
          const under = r.bottom > home.top - 8 && r.top < home.bottom + 8;
          if (across && under) needed = Math.max(needed, home.bottom - r.top + 8);
        }
        setLift(Math.min(needed, vh - size - 2 * gap));
      });
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    const obs = new MutationObserver(place);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      obs.disconnect();
    };
  }, []);

  return (
    <button
      ref={(el) => {
        own.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) (ref as React.RefObject<HTMLButtonElement | null>).current = el;
      }}
      type="button"
      hidden={hidden}
      onClick={() => assistant.open()}
      aria-haspopup="dialog"
      style={{ transform: lift ? `translateY(-${lift}px)` : undefined }}
      className="ask-button fixed right-4 bottom-4 z-40 flex size-16 cursor-pointer flex-col items-center justify-center rounded-full border border-blue bg-blue text-white hover:border-ink hover:bg-ink"
    >
      <MessageCircleQuestion aria-hidden size={22} />
      <span className="text-small font-semibold">Ask</span>
    </button>
  );
}

function SidePanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // Move focus in on open, unless the body already put it somewhere inside (the question box, for "Ask about this").
    if (open && !ref.current?.contains(document.activeElement)) ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [open]);
  return (
    <section
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistant-title"
      aria-hidden={!open || undefined}
      inert={!open}
      data-open={open || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="side-panel fixed top-0 right-0 bottom-0 z-40 flex flex-col border-l border-hairline bg-paper"
    >
      {children}
    </section>
  );
}

function PanelBody({ step, checkId, onClose, closeOnLink }: { step: string; checkId: string | null; onClose: () => void; closeOnLink: boolean }) {
  const s = useSyncExternalStore(assistant.subscribe, assistant.get, assistant.get);
  const { meta } = useMeta();
  const [check, setCheck] = useState<Check | null>(null);
  const [text, setText] = useState(s.draft);
  const box = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [seenDraft, setSeenDraft] = useState(s.draftVersion);

  // A question put in the box by "Ask about this" (or cleared): show it, and put the cursor there.
  if (seenDraft !== s.draftVersion) {
    setSeenDraft(s.draftVersion);
    setText(s.draft);
  }
  useEffect(() => {
    if (s.draft) box.current?.focus();
    else titleRef.current?.focus();
  }, [s.draftVersion, s.draft]);

  useEffect(() => {
    let live = true;
    if (checkId) loadCheck(checkId).then((c) => live && setCheck(c), () => live && setCheck(null));
    return () => {
      live = false;
    };
  }, [checkId]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [s.messages.length]);

  const hasResult = !!checkId;
  const send = async (question: string, opts: { spoken?: boolean } = {}) => {
    const q = question.trim();
    if (!q || s.pending) return;
    assistant.add({ role: "user", text: q, spoken: opts.spoken });
    setText("");
    if (!checkId) {
      const topic = matchHelp(q);
      assistant.add(topic
        ? { role: "assistant", text: topic.answer, cited: [], by: "help", spoken: opts.spoken }
        : { role: "assistant", text: BEFORE_RESULT, cited: [], by: "help", spoken: opts.spoken });
      return;
    }
    assistant.setPending(true);
    const history = assistant.get().messages
      .filter((m): m is Extract<Message, { role: "user" | "assistant" }> => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .slice(-(meta?.limits.max_history_turns ?? 6))
      .map((m) => ({ role: m.role, content: m.text }));
    try {
      const a = await call(() => api.POST("/api/checks/{check_id}/ask", { params: { path: { check_id: checkId } }, body: { question: q, history } }));
      assistant.add({ role: "assistant", text: a.text, cited: a.cited_rules, by: a.generated_by === "template" ? "template" : "model", spoken: opts.spoken });
    } catch (e) {
      assistant.add({ role: "problem", text: errorWords(e instanceof ApiProblem ? e.code : "network") });
    } finally {
      assistant.setPending(false);
    }
  };

  const suggestions = hasResult ? RESULT_SUGGESTIONS : (SUGGESTIONS[step] ?? SUGGESTIONS.start).map((id) => HELP.find((h) => h.id === id)!.question);
  const answerSuggestion = (q: string) => {
    if (hasResult) return void send(q);
    const topic = HELP.find((h) => h.question === q)!;
    assistant.add({ role: "user", text: q });
    assistant.add({ role: "assistant", text: topic.answer, cited: [], by: "help" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
        <Heading id="assistant-title" ref={titleRef} tabIndex={-1} level={2} slot="title" className="m-0 text-section-heading outline-none" data-autofocus>
          Ask about the pre-check
        </Heading>
        <Button variant="quiet" aria-label="Close" onPress={onClose} className="-mr-2 min-h-11 min-w-11 no-underline">
          <X aria-hidden size={22} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <p className="m-0 text-small text-ink-muted">{CAN_AND_CANNOT}</p>

        <div role="log" aria-live="polite" aria-label="Conversation">
        <ol ref={list} className="m-0 mt-4 flex list-none flex-col gap-4 p-0">
          {s.messages.map((m, i) => (
            <MessageItem key={i} m={m} check={check} checkId={checkId} onLink={closeOnLink ? onClose : undefined}
              onTopic={answerSuggestion} showTopics={!hasResult && m.role === "assistant" && m.text === BEFORE_RESULT} suggestions={suggestions} />
          ))}
          {s.pending ? <li className="text-ink-muted">Writing an answer from your result…</li> : null}
        </ol>
        </div>

        {!s.messages.length ? (
          <div className="mt-4 flex flex-col items-start gap-1">
            <p className="m-0 text-small font-semibold">You could ask</p>
            {suggestions.map((q) => (
              <Button key={q} variant="quiet" className="text-left" onPress={() => answerSuggestion(q)}>{q}</Button>
            ))}
          </div>
        ) : null}
      </div>

      <form className="flex flex-col gap-2 border-t border-hairline px-4 py-3"
        onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <label htmlFor="assistant-question" className="font-semibold">Your question</label>
        <textarea
          id="assistant-question"
          ref={box}
          name="question"
          rows={2}
          value={text}
          maxLength={meta?.limits.max_question_chars ?? 500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send(text);
            }
          }}
          aria-describedby="assistant-hint"
          className="block w-full resize-y rounded-sm border border-field bg-white px-3 py-2 text-body"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id="assistant-hint" className="text-small text-ink-muted">Ctrl or ⌘ and Enter also sends.</span>
          <div className="flex items-center gap-2">
            {s.messages.length ? <Button variant="quiet" onPress={() => assistant.clear()}>Clear the conversation</Button> : null}
            <Button type="submit" variant="secondary" className="border-blue text-blue" isDisabled={s.pending}>Send</Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageItem({ m, check, checkId, onLink, onTopic, showTopics, suggestions }: {
  m: Message;
  check: Check | null;
  checkId: string | null;
  onLink?: () => void;
  onTopic: (q: string) => void;
  showTopics: boolean;
  suggestions: string[];
}) {
  if (m.role === "user") {
    return (
      <li className="self-end max-w-[90%] rounded-sm border border-hairline bg-white px-3 py-2">
        <span className="sr-only">You asked: </span>
        <span className="whitespace-pre-wrap break-words">{m.text}</span>
      </li>
    );
  }
  if (m.role === "problem") {
    return <li className="font-semibold text-fix" role="alert">{m.text}</li>;
  }
  const findings = check?.result.findings ?? [];
  const links = m.cited.flatMap((rule) => findings.map((f, i) => ({ f, i })).filter(({ f }) => f.rule_id === rule));
  return (
    <li className="flex flex-col gap-2">
      <span className="sr-only">Answer: </span>
      <p className="m-0 whitespace-pre-wrap break-words">{m.text}</p>
      {showTopics ? (
        <div className="flex flex-col items-start">
          {suggestions.map((q) => <Button key={q} variant="quiet" className="text-left" onPress={() => onTopic(q)}>{q}</Button>)}
        </div>
      ) : null}
      {links.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-small font-semibold">From your result</span>
          <ul className="m-0 flex list-none flex-col p-0">
            {links.map(({ f, i }) => (
              <li key={i}>
                <a
                  href={onResults() ? `#${findingAnchor(i)}` : `/results/?check=${encodeURIComponent(checkId ?? "")}#${findingAnchor(i)}`}
                  className="inline-flex min-h-11 items-center break-words"
                  onClick={(e) => {
                    const el = document.getElementById(findingAnchor(i));
                    if (!el) return;
                    e.preventDefault();
                    onLink?.();
                    requestAnimationFrame(() => {
                      el.scrollIntoView({ block: "start" });
                      el.focus({ preventScroll: true });
                    });
                  }}
                >
                  {f.title} ({look(f.status).word})
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <span className="text-small text-ink-muted">
        {m.by === "help" ? "From the pre-check's help text." : m.by === "template" ? "Written from your result by a template." : "Written from your result by the model."}
      </span>
    </li>
  );
}

const onResults = () => typeof window !== "undefined" && window.location.pathname.startsWith("/results");

