"use client";
/**
 * Step 4, "Your pre-check results", for the check in the address (?check=<id>), as GET /api/checks/{id} returns it.
 * Five sections, in order: the heading and a tab row "In short", "Zoning", "Downloads"; "Fix before you apply (n)",
 * always shown in full; a tab row "Check with the city (n)", "OK (n)"; the permits; Seattle's records. Then notices,
 * the code basis and the disclaimer, and how long the check is kept, with "Delete this check now". "On this page"
 * shows where the owner is among the five. The selected tabs survive a refresh, and a link to a finding opens its
 * tab first. Everything shown is the API's.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Download, MessageCircleQuestion, Trash2 } from "lucide-react";
import { assistant } from "@/state/assistant";
import { api, ApiProblem, call, forgetCheck, loadCheck, reportUrl, sheetUrl, type Check, type ZoningResponse } from "@/api/client";
import { LazyPlaceMap } from "@/components/map/LazyPlaceMap";
import { errorWords } from "@/api/errors";
import { PageShell } from "@/components/flow/PageShell";
import { Button } from "@/components/ui/button";
import { CountsSentence } from "@/components/results/CountsSentence";
import { FindingCard, findingAnchor } from "@/components/results/FindingCard";
import { PermitList } from "@/components/results/PermitList";
import { RecordLines, type ReviewData } from "@/components/results/RecordLines";
import { StatusTag } from "@/components/results/StatusTag";
import { defaultTab, FIX, groupOf, groups, look, TAB_GROUPS, type Numbered, type Status, ZONING_WORDS } from "@/components/results/status";
import { OnThisPageBar, OnThisPageRail, useCurrentSection, type PageSection } from "@/components/results/OnThisPage";
import { TabRow } from "@/components/results/TabRow";
import { formatDate, formatNumber } from "@/lib/format";
import { flow } from "@/state/flow";
import { findingInHash, resultsTabs, REVEAL_FINDING } from "@/state/resultsTabs";

export function ResultsPage() {
  const id = useSearchParams().get("check");
  const [check, setCheck] = useState<Check | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    flow.setCheckId(id);
    loadCheck(id).then(
      (c) => live && setCheck(c),
      (e) => live && setProblem(e instanceof ApiProblem ? e.code : "network"),
    );
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <PageShell step={4} back="/check/" title="Your pre-check results" wide center>
      {!id ? (
        <p className="m-0">There is no check to show. <Link href="/">Start a pre-check</Link>.</p>
      ) : problem ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="m-0">{errorWords(problem)}</p>
          <p className="m-0"><Link href="/">Start a new check</Link></p>
        </div>
      ) : !check ? (
        <p className="m-0" aria-live="polite">Loading the results…</p>
      ) : (
        <Results check={check} />
      )}
    </PageShell>
  );
}

const SUMMARY_TABS = ["short", "zoning", "downloads"] as const;
const TABS_LABEL = "Check with the city / OK";

export function Results({ check }: { check: Check }) {
  const r = check.result;
  const all = groups(r.findings);
  const counts = Object.fromEntries(all.map((g) => [g.status, g.items.length])) as Record<Status, number>;
  const byStatus = Object.fromEntries(all.map((g) => [g.status, g.items])) as Record<Status, Numbered[]>;
  // A link to a finding ("#finding-3") opens that finding's tab; otherwise the tab kept for this check, then the default.
  const [hashFinding] = useState(() => findingInHash(window.location.hash));
  const [summaryTab, setSummaryTab] = useState(() => {
    const kept = resultsTabs.read(check.id).summary;
    return SUMMARY_TABS.includes(kept as never) ? kept! : "short";
  });
  const [findingsTab, setFindingsTab] = useState<Status>(() => {
    const target = hashFinding !== null ? r.findings[hashFinding] : undefined;
    if (target && TAB_GROUPS.includes(groupOf(target.status))) return groupOf(target.status);
    const kept = resultsTabs.read(check.id).findings;
    if (TAB_GROUPS.includes(kept as Status)) return kept as Status;
    return defaultTab(counts);
  });
  const [reveal, setReveal] = useState<number | null>(hashFinding);

  useEffect(() => resultsTabs.write(check.id, { summary: summaryTab, findings: findingsTab }), [check.id, summaryTab, findingsTab]);

  // The assistant's "From your result" links: open the finding's tab, then scroll to it once it is in the page.
  useEffect(() => {
    const onReveal = (e: Event) => {
      const i = (e as CustomEvent<number>).detail;
      const f = r.findings[i];
      if (!f) return;
      if (TAB_GROUPS.includes(groupOf(f.status))) setFindingsTab(groupOf(f.status));   // Fix findings are always shown
      setReveal(i);
    };
    // A "#finding-<index>" typed or followed while the page is open does the same.
    const onHash = () => {
      const i = findingInHash(window.location.hash);
      if (i !== null) onReveal(new CustomEvent(REVEAL_FINDING, { detail: i }));
    };
    window.addEventListener(REVEAL_FINDING, onReveal);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(REVEAL_FINDING, onReveal);
      window.removeEventListener("hashchange", onHash);
    };
  }, [r.findings]);
  useEffect(() => {
    if (reveal === null) return;
    // React Aria keeps the previous tab's panel in the page for one more frame (for an exit animation), and that
    // panel can sit above the finding: scroll once it has gone, two frames on.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const el = document.getElementById(findingAnchor(reveal));
        if (el) {
          el.scrollIntoView({ block: "start" });
          el.focus({ preventScroll: true });
        }
        setReveal(null);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal, findingsTab]);

  const sections: PageSection[] = [
    { id: "section-results", label: "Your pre-check results", short: "Your pre-check results", target: () => document.getElementById("page-heading") },
    { id: "section-fix", label: `${look(FIX).group} (${counts[FIX]})`, short: look(FIX).group, target: () => document.getElementById("fix-heading") },
    { id: "section-tabs", label: TABS_LABEL, short: TABS_LABEL, target: () => document.getElementById("tabs-heading") },
    { id: "section-permits", label: "Permits and approvals to expect", short: "Permits and approvals", target: () => document.getElementById("permits") },
    { id: "section-records", label: "What Seattle\u2019s records show about businesses like yours", short: "Seattle\u2019s records",
      target: () => document.getElementById("records") },
  ];
  const current = useCurrentSection(sections.map((x) => x.id), "results-end");

  return (
    <div className="results-frame">
      <OnThisPageBar sections={sections} current={current} />
      <OnThisPageRail sections={sections} current={current} />
    <div className="results-column flex min-w-0 flex-col gap-12">
      <section id="section-results" aria-labelledby="summary-tabs" className="flex flex-col">
        <h2 id="summary-tabs" className="sr-only">Summary</h2>
        <TabRow label="Summary" selected={summaryTab} onSelect={setSummaryTab} items={[
          { id: "short", label: "In short", panel: <InShort check={check} /> },
          { id: "zoning", label: "Zoning", panel: <ZoningPanel check={check} /> },
          { id: "downloads", label: "Downloads", panel: <Downloads check={check} /> },
        ]} />
      </section>

      <section id="section-fix" aria-labelledby="fix-heading" className="flex flex-col gap-4">
        <h2 id="fix-heading" tabIndex={-1} className="m-0 text-section-heading">
          {look(FIX).group} <span className="font-normal text-ink-muted nums">({counts[FIX]})</span>
        </h2>
        <FindingList items={byStatus[FIX]} empty={look(FIX).empty} />
      </section>

      <section id="section-tabs" aria-labelledby="tabs-heading" className="flex flex-col gap-4">
        <h2 id="tabs-heading" tabIndex={-1} className="m-0 text-section-heading">{TABS_LABEL}</h2>
        <TabRow label={TABS_LABEL} selected={findingsTab} onSelect={(k) => setFindingsTab(k as Status)}
          items={TAB_GROUPS.map((st) => ({
            id: st, status: st, label: `${look(st).group} (${counts[st]})`,
            panel: <FindingList items={byStatus[st]} empty={look(st).empty} />,
          }))} />
      </section>

      <section id="section-permits" aria-labelledby="permits" className="flex flex-col gap-2">
        <h2 id="permits" tabIndex={-1} className="m-0 text-section-heading">Permits and approvals to expect</h2>
        <PermitList permits={r.permits_likely_required} />
      </section>

      <section id="section-records" aria-labelledby="records" className="flex flex-col gap-2">
        <h2 id="records" tabIndex={-1} className="m-0 text-section-heading">What Seattle&rsquo;s records show about businesses like yours</h2>
        <RecordLines data={r.local_review_data as ReviewData | null | undefined} />
      </section>

      {check.notices?.length ? (
        <section aria-labelledby="notices" className="flex flex-col gap-2">
          <h2 id="notices" className="m-0 text-section-heading">Also note</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
            {check.notices.map((n) => <li key={n} className="measure break-words">{n}</li>)}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="basis" className="flex flex-col gap-2 border-t border-hairline pt-8 text-small text-ink-muted">
        <h2 id="basis" className="m-0 text-body font-semibold text-ink">About this result</h2>
        <p className="m-0 measure">{r.disclaimer}</p>
        <p className="m-0 measure">Rules from: {r.code_basis}</p>
      </section>

      <KeptUntil check={check} />
      <div id="results-end" aria-hidden />
    </div>
    </div>
  );
}

function FindingList({ items, empty }: { items: Numbered[]; empty: string }) {
  if (!items.length) return <p className="m-0">{empty}</p>;
  return (
    <div className="flex flex-col gap-4">
      {items.map(({ finding, index }) => <FindingCard key={index} finding={finding} index={index} actions={<AskAbout title={finding.title} />} />)}
    </div>
  );
}

function InShort({ check }: { check: Check }) {
  const s = check.result.summary;
  return (
    <div className="flex flex-col gap-4">
      <CountsSentence summary={s} />
      <dl className="m-0 flex flex-col text-ink nums">
        <Row label="Business">{s.business_label}</Row>
        <Row label="Occupant load"><span className="font-mono">{formatNumber(s.occupant_load)}</span></Row>
        <Row label="Occupancy group"><span className="font-mono" translate="no">{s.occupancy_group}</span></Row>
        <Row label="Exits shown, of those required"><span className="font-mono">{formatNumber(s.exits_shown)} of {formatNumber(s.exits_required)}</span></Row>
      </dl>
    </div>
  );
}

function Downloads({ check }: { check: Check }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <a href={reportUrl(check.id)} target="_blank" rel="noopener" data-main-action className="inline-flex min-h-12 w-full items-center gap-2 rounded-sm border border-blue bg-blue px-4 py-2 font-semibold text-white no-underline hover:border-ink hover:bg-ink sm:w-auto">
        <Download aria-hidden size={18} className="shrink-0" /> Download the fix list (PDF)
      </a>
      <a href={sheetUrl(check.id)} target="_blank" rel="noopener" className="inline-flex min-h-12 w-full items-center gap-2 rounded-sm border border-field bg-white px-4 py-2 font-semibold text-ink no-underline hover:border-ink sm:w-auto">
        <Download aria-hidden size={18} className="shrink-0" /> Download the permit preparation sheet (PDF)
      </a>
    </div>
  );
}

function ZoningPanel({ check }: { check: Check }) {
  const z = check.result.zoning;
  const zw = z ? ZONING_WORDS[z.status] : null;
  if (!z || !zw) return <p className="m-0">No address or zone was given, so zoning was not screened.</p>;
  return (
    <div className="flex flex-col items-start gap-2" data-testid="zoning">
      <StatusTag status={zw.status} word={zw.word} />
      <p className="m-0"><span className="text-ink-muted">Zone: </span><span className="font-mono font-semibold" translate="no">{z.district ?? "Not found"}</span></p>
      {typeof z.address === "string" && z.address.trim() ? <p className="m-0 break-words"><span className="text-ink-muted">Address: </span>{z.address}</p> : null}
      <p className="m-0 break-words">{z.detail}</p>
      {typeof z.address === "string" && z.address.trim() ? <ZoningMap address={z.address} businessType={check.result.summary.business_type} zone={z.district} /> : null}
      {overlayWords(z.overlays).length ? (
        <p className="m-0 break-words"><span className="text-ink-muted">Overlays: </span>{overlayWords(z.overlays).join(", ")}</p>
      ) : null}
      {typeof z.fix === "string" && z.fix ? <p className="m-0 break-words"><span className="font-semibold">What to do: </span>{z.fix}</p> : null}
    </div>
  );
}

/** The zoning card's map: the pin, the zone's outline and its name, for a check that used an address (POST /api/zoning once). */
function ZoningMap({ address, businessType, zone }: { address: string; businessType: string; zone: string | null }) {
  const [place, setPlace] = useState<ZoningResponse | null>(null);
  useEffect(() => {
    let live = true;
    call(() => api.POST("/api/zoning", { body: { address, business_type: businessType } })).then((z) => live && setPlace(z), () => undefined);
    return () => {
      live = false;
    };
  }, [address, businessType]);
  if (!place?.point) return null;           // no point: no map; the zoning is written out above and below
  return <LazyPlaceMap point={place.point} outline={place.outline} zoneName={zone}
    label={`Map of ${address} with the outline of zone ${zone ?? "unknown"}`} />;
}

/** "Ask about this": opens the assistant with a question about this finding in the box. Nothing is sent until Send. */
function AskAbout({ title }: { title: string }) {
  return (
    <Button variant="quiet" onPress={() => assistant.askAbout(`Tell me more about “${title}”.`)} aria-label={`Ask about this: ${title}`}>
      <MessageCircleQuestion aria-hidden size={18} /> Ask about this
    </Button>
  );
}

function overlayWords(overlays: unknown): string[] {
  if (!overlays || typeof overlays !== "object") return [];
  return Object.entries(overlays as Record<string, unknown>).filter(([, v]) => v).map(([k, v]) => (typeof v === "string" ? v : k.replace(/_/g, " ")));
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-hairline py-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="m-0 whitespace-nowrap text-right">{children}</dd>
    </div>
  );
}

/** D9: how long the check is kept, and deleting it now, with a confirmation. */
function KeptUntil({ check }: { check: Check }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setProblem(null);
    try {
      await call(() => api.DELETE("/api/checks/{check_id}", { params: { path: { check_id: check.id } } }));
      flow.setCheckId(null);
      forgetCheck(check.id);
      router.push("/?deleted=1");
    } catch (e) {
      setProblem(errorWords(e instanceof ApiProblem ? e.code : "network"));
      setDeleting(false);
    }
  };

  return (
    <section aria-labelledby="kept" className="flex flex-col items-start gap-2 border-t border-hairline pt-8">
      <h2 id="kept" className="m-0 text-body font-semibold">Your check is kept for you</h2>
      <p className="m-0 measure">
        This check is kept until <time dateTime={check.expires_at}>{formatDate(check.expires_at)}</time>, so this page&rsquo;s address keeps working.
        Anyone with the address can open it. Your plan file itself was not kept.
      </p>
      <Button variant="danger" onPress={() => setOpen(true)}><Trash2 aria-hidden size={18} /> Delete this check now…</Button>
      <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-ink/40 p-4">
        <Modal className="w-full max-w-lg rounded-sm border border-ink bg-paper p-6">
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            <Heading slot="title" className="m-0 text-section-heading">Delete this check?</Heading>
            <p className="m-0">The results, the facts read from your plan and your answers are deleted from the server now. This cannot be undone.</p>
            {problem ? <p role="alert" className="m-0 font-semibold text-fix">{problem}</p> : null}
            <div className="flex flex-wrap gap-4">
              <Button variant="danger" onPress={remove} pending={deleting} isDisabled={deleting} className="border-2">
                {deleting ? "Deleting…" : "Delete the check"}
              </Button>
              <Button variant="secondary" autoFocus onPress={() => setOpen(false)}>Keep it</Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </section>
  );
}
