"use client";
/**
 * Step 4, "Your pre-check results", for the check in the address (?check=<id>), as GET /api/checks/{id} returns it.
 * Findings in 8 columns (Fix, Check with the city, OK collapsed); a sticky summary in 4 (counts, downloads,
 * zoning, the figures behind the check). Then permits, Seattle's records, notices, the code basis and the
 * disclaimer, and how long the check is kept, with "Delete this check now". Everything shown is the API's.
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dialog, Disclosure, DisclosurePanel, Heading, Modal, ModalOverlay, Button as AriaButton } from "react-aria-components";
import { ChevronDown, Download, MessageCircleQuestion, Trash2 } from "lucide-react";
import { assistant } from "@/state/assistant";
import { api, ApiProblem, call, forgetCheck, loadCheck, reportUrl, sheetUrl, type Check, type ZoningResponse } from "@/api/client";
import { LazyPlaceMap } from "@/components/map/LazyPlaceMap";
import { errorWords } from "@/api/errors";
import { PageShell } from "@/components/flow/PageShell";
import { Button } from "@/components/ui/button";
import { CountsSentence } from "@/components/results/CountsSentence";
import { FindingCard } from "@/components/results/FindingCard";
import { PermitList } from "@/components/results/PermitList";
import { RecordLines, type ReviewData } from "@/components/results/RecordLines";
import { StatusTag } from "@/components/results/StatusTag";
import { groups, look, ZONING_WORDS } from "@/components/results/status";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { flow } from "@/state/flow";

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
    <PageShell step={4} back="/check/" title="Your pre-check results" wide>
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

export function Results({ check }: { check: Check }) {
  const r = check.result;
  const [fix, city, ok] = groups(r.findings);
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-12 lg:grid-cols-12">
      <aside aria-label="Summary" className="min-w-0 lg:order-last lg:col-span-4">
        <div className="flex flex-col gap-8 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-48px)] lg:overflow-y-auto lg:overscroll-contain">
          <Summary check={check} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-12 lg:col-span-8">
        {[fix, city].map((g) =>
          g.items.length ? (
            <section key={g.status} aria-labelledby={`group-${g.status}`} className="flex flex-col gap-4">
              <h2 id={`group-${g.status}`} className="m-0 flex items-center gap-2 text-section-heading">
                {look(g.status).group} <span className="font-normal text-ink-muted nums">({g.items.length})</span>
              </h2>
              {g.items.map(({ finding, index }) => <FindingCard key={index} finding={finding} index={index} actions={<AskAbout title={finding.title} />} />)}
            </section>
          ) : null,
        )}
        {!fix.items.length && !city.items.length ? (
          <p className="m-0 text-section-heading font-normal">Nothing to fix or to check with the city on the items this pre-check looks at.</p>
        ) : null}

        {ok.items.length ? (
          <Disclosure className="border-t border-b border-hairline">
            {({ isExpanded }) => (
              <>
                <Heading level={2} className="m-0">
                  <AriaButton slot="trigger" className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 py-2 text-left text-section-heading font-semibold">
                    <span>OK <span className="font-normal text-ink-muted nums">({ok.items.length})</span></span>
                    <ChevronDown aria-hidden size={24} className={cn("shrink-0", isExpanded && "rotate-180")} />
                  </AriaButton>
                </Heading>
                <DisclosurePanel>
                  <div className="flex flex-col gap-4 pb-6">
                    {ok.items.map(({ finding, index }) => <FindingCard key={index} finding={finding} index={index} actions={<AskAbout title={finding.title} />} />)}
                  </div>
                </DisclosurePanel>
              </>
            )}
          </Disclosure>
        ) : null}

        <section aria-labelledby="permits" className="flex flex-col gap-2">
          <h2 id="permits" className="m-0 text-section-heading">Permits and approvals to expect</h2>
          <PermitList permits={r.permits_likely_required} />
        </section>

        <section aria-labelledby="records" className="flex flex-col gap-2">
          <h2 id="records" className="m-0 text-section-heading">What Seattle&rsquo;s records show</h2>
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
      </div>
    </div>
  );
}

function Summary({ check }: { check: Check }) {
  const r = check.result;
  const s = r.summary;
  const z = r.zoning;
  const zw = z ? ZONING_WORDS[z.status] : null;
  return (
    <>
      <section aria-labelledby="summary-heading" className="flex flex-col gap-4">
        <h2 id="summary-heading" className="m-0 text-section-heading">In short</h2>
        <CountsSentence summary={s} />
        <dl className="m-0 flex flex-col text-ink nums">
          <Row label="Business">{s.business_label}</Row>
          <Row label="Occupant load"><span className="font-mono">{formatNumber(s.occupant_load)}</span></Row>
          <Row label="Occupancy group"><span className="font-mono" translate="no">{s.occupancy_group}</span></Row>
          <Row label="Exits shown, of those required"><span className="font-mono">{formatNumber(s.exits_shown)} of {formatNumber(s.exits_required)}</span></Row>
        </dl>
      </section>

      <section aria-labelledby="downloads" className="flex flex-col items-start gap-4">
        <h2 id="downloads" className="m-0 text-section-heading">Downloads</h2>
        <a href={reportUrl(check.id)} target="_blank" rel="noopener" data-main-action className="inline-flex min-h-12 w-full items-center gap-2 rounded-sm border border-blue bg-blue px-4 py-2 font-semibold text-white no-underline hover:border-ink hover:bg-ink">
          <Download aria-hidden size={18} className="shrink-0" /> Download the fix list (PDF)
        </a>
        <a href={sheetUrl(check.id)} target="_blank" rel="noopener" className="inline-flex min-h-12 w-full items-center gap-2 rounded-sm border border-field px-4 py-2 font-semibold text-ink no-underline hover:border-ink hover:bg-white">
          <Download aria-hidden size={18} className="shrink-0" /> Download the permit preparation sheet (PDF)
        </a>
      </section>

      <section aria-labelledby="zoning" className="flex flex-col gap-2">
        <h2 id="zoning" className="m-0 text-section-heading">Zoning</h2>
        {z && zw ? (
          <div className="flex flex-col items-start gap-2">
            <StatusTag status={zw.status} word={zw.word} />
            <p className="m-0"><span className="text-ink-muted">Zone: </span><span className="font-mono font-semibold" translate="no">{z.district ?? "Not found"}</span></p>
            {typeof z.address === "string" && z.address.trim() ? <p className="m-0 break-words"><span className="text-ink-muted">Address: </span>{z.address}</p> : null}
            <p className="m-0 break-words">{z.detail}</p>
            {typeof z.address === "string" && z.address.trim() ? <ZoningMap address={z.address} businessType={s.business_type} zone={z.district} /> : null}
            {overlayWords(z.overlays).length ? (
              <p className="m-0 break-words"><span className="text-ink-muted">Overlays: </span>{overlayWords(z.overlays).join(", ")}</p>
            ) : null}
            {typeof z.fix === "string" && z.fix ? <p className="m-0 break-words"><span className="font-semibold">What to do: </span>{z.fix}</p> : null}
          </div>
        ) : (
          <p className="m-0">No address or zone was given, so zoning was not screened.</p>
        )}
      </section>
    </>
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
