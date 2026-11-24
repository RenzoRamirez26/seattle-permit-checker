"use client";
/**
 * Step 4, "Your pre-check results", for the check in the address (?check=<id>), as GET /api/checks/{id} returns it.
 * Full-width zones (DESIGN.md, Zones): a blue hero with the title, the facts line, the disclaimer and the pill tabs
 * In short / Zoning / Downloads; their panel in a tint zone; "Fix before you apply" in a white zone, always shown;
 * "Check with the city" and "No issues found" as tabs in a paper zone; permits in a white zone; Seattle's records in a
 * dark zone; then the notes, how long the check is kept, and one next step. "On this page" shows where the owner is.
 * The selected tabs survive a refresh, and a link to a finding opens its tab first. Everything shown is the API's.
 */
import { ruleUnverified, SOME_UNVERIFIED, UNVERIFIED_FINDING, usesUnverifiedRule, ZONING_RULE } from "@/content/verification";
import { Fragment, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Dialog, Heading, Modal, ModalOverlay, Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import { Download, MessageCircleQuestion, Trash2 } from "lucide-react";
import { assistant } from "@/state/assistant";
import { api, ApiProblem, call, forgetCheck, loadCheck, reportUrl, sheetUrl, type Check, type Finding, type ZoningResponse } from "@/api/client";
import { LazyPlaceMap } from "@/components/map/LazyPlaceMap";
import { errorWords } from "@/api/errors";
import { PageShell } from "@/components/flow/PageShell";
import { Button } from "@/components/ui/button";
import { CountsSentence } from "@/components/results/CountsSentence";
import { FindingCard, findingAnchor } from "@/components/results/FindingCard";
import { PermitList } from "@/components/results/PermitList";
import { recordGroups, type ReviewData } from "@/components/results/RecordLines";
import { StatusIcon } from "@/components/results/StatusIcon";
import { PageHeading } from "@/components/flow/PageHeading";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";
import { StatusTag } from "@/components/results/StatusTag";
import { defaultTab, FIX, groupOf, groups, look, TAB_GROUPS, UNKNOWN_ZONING, type Numbered, type Status, ZONING_WORDS } from "@/components/results/status";
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

  if (id && check && !problem) return <Results check={check} />;     // the results carry their own hero and h1
  return (
    <PageShell step={4} back="/check/" title="Your pre-check results" wide>
      {!id ? (
        <p className="m-0">There is no check to show. <Link href="/">Start a pre-check</Link>.</p>
      ) : problem ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="m-0">{errorWords(problem)}</p>
          <p className="m-0"><Link href="/">Start a new check</Link></p>
        </div>
      ) : (
        <p className="m-0" aria-live="polite">Loading the results…</p>
      )}
    </PageShell>
  );
}

const SUMMARY_TABS = ["short", "zoning", "downloads"] as const;
const TABS_LABEL = "Check with the city / No issues found";
/** Lists longer than this show the first few, then "Show all N". */
const FIRST = 5;

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
  // Groups showing every finding ("Show all N"); a link to a finding beyond the first few opens its group in full.
  const [expanded, setExpanded] = useState<Set<Status>>(() => {
    const target = hashFinding !== null ? r.findings[hashFinding] : undefined;
    return new Set(target ? [groupOf(target.status)] : []);
  });
  const [reveal, setReveal] = useState<number | null>(hashFinding);

  useEffect(() => resultsTabs.write(check.id, { summary: summaryTab, findings: findingsTab }), [check.id, summaryTab, findingsTab]);

  // The assistant's "From your result" links: open the finding's tab and group, then scroll to it once it is in the page.
  useEffect(() => {
    const onReveal = (e: Event) => {
      const i = (e as CustomEvent<number>).detail;
      const f = r.findings[i];
      if (!f) return;
      const g = groupOf(f.status);
      if (TAB_GROUPS.includes(g)) setFindingsTab(g);   // Fix findings are always shown
      setExpanded((x) => new Set(x).add(g));
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
  }, [reveal, findingsTab, expanded]);

  const showAll = (g: Status) => setExpanded((x) => new Set(x).add(g));

  const sections: PageSection[] = [
    { id: "section-results", label: "Your pre-check results", short: "Your pre-check results", target: () => document.getElementById("page-heading") },
    { id: "section-fix", label: `${look(FIX).group} (${counts[FIX]})`, short: look(FIX).group, target: () => document.getElementById("fix-heading") },
    // The short label keeps the phone bar to two lines, so it stays inside the 96 px scroll padding.
    { id: "section-tabs", label: TABS_LABEL, short: look(TAB_GROUPS[0]).group, target: () => document.getElementById("tabs-heading") },
    { id: "section-permits", label: "Permits and approvals to expect", short: "Permits and approvals", target: () => document.getElementById("permits") },
    { id: "section-records", label: "What Seattle’s records show about businesses like yours", short: "Seattle’s records",
      target: () => document.getElementById("records") },
  ];
  const current = useCurrentSection(sections.map((x) => x.id), "results-end");

  return (
    <div className="relative">
      <OnThisPageBar sections={sections} current={current} />
      <Tabs selectedKey={summaryTab} onSelectionChange={(k) => setSummaryTab(String(k))}>
        <section id="section-results" aria-labelledby="page-heading" className="bg-blue text-hero-text">
          <Band className="flex flex-col items-center gap-4 py-12 text-center">
            <PageHeading className="text-hero-text">Your pre-check results</PageHeading>
            <p className="m-0 text-hero-muted nums" data-testid="facts-line">
              {factsLine(check).map((part, i) => <Fragment key={part}>{i ? " · " : ""}<span className="whitespace-nowrap">{part}</span></Fragment>)}
            </p>
            <p className="m-0 font-medium">A pre-check from the checks we ran, not a city approval.</p>
            <TabList aria-label="Summary" className="mt-2 flex flex-wrap justify-center gap-2">
              {[["short", "In short"], ["zoning", "Zoning"], ["downloads", "Downloads"]].map(([id, label]) => (
                <Tab key={id} id={id} className={({ isSelected }) => cn(
                  "flex min-h-12 cursor-pointer items-center rounded-full border px-5 font-medium outline-none",
                  "data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-white",
                  isSelected ? "border-tint bg-tint text-blue" : "border-hero-muted text-hero-text data-[hovered]:underline",
                )}>{label}</Tab>
              ))}
            </TabList>
          </Band>
        </section>
        <div className="bg-tint">
          <Band className="py-12">
            <TabPanel id="short" className="outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-4 data-[focus-visible]:outline-blue">
              <InShort check={check} />
            </TabPanel>
            <TabPanel id="zoning" className="outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-4 data-[focus-visible]:outline-blue">
              <ZoningPanel check={check} />
            </TabPanel>
            <TabPanel id="downloads" className="outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-4 data-[focus-visible]:outline-blue">
              <Downloads check={check} />
            </TabPanel>
          </Band>
        </div>
      </Tabs>

      <section id="section-fix" aria-labelledby="fix-heading" className="bg-white">
        <Band className="flex flex-col gap-4 py-12">
          <h2 id="fix-heading" tabIndex={-1} className="m-0 flex items-center gap-3 text-section-heading">
            {/* red only marks something to fix: with nothing to fix, the heading uses the quiet "no issues" mark */}
            <StatusIcon mark={counts[FIX] ? look(FIX).mark : look(TAB_GROUPS[1]).mark} size={24} />
            <span>{look(FIX).group} <span className={cn("nums", counts[FIX] > 0 && "text-fix")}>({counts[FIX]})</span></span>
          </h2>
          {counts[FIX] ? <p className="m-0">These are likely to stop a permit review.</p> : null}
          <FindingRows status={FIX} items={byStatus[FIX]} expanded={expanded.has(FIX)} onShowAll={() => showAll(FIX)} />
        </Band>
      </section>

      <section id="section-tabs" aria-labelledby="tabs-heading" className="bg-paper">
        <Band className="flex flex-col gap-4 py-12">
          <h2 id="tabs-heading" tabIndex={-1} className="m-0 text-section-heading">{TABS_LABEL}</h2>
          <TabRow label={TABS_LABEL} selected={findingsTab} onSelect={(k) => setFindingsTab(k as Status)}
            items={TAB_GROUPS.map((st) => ({
              id: st, status: st, label: `${look(st).group} (${counts[st]})`,
              panel: <FindingRows status={st} items={byStatus[st]} expanded={expanded.has(st)} onShowAll={() => showAll(st)} />,
            }))} />
        </Band>
      </section>

      <section id="section-permits" aria-labelledby="permits" className="bg-white">
        <Band className="flex flex-col gap-4 py-12">
          <h2 id="permits" tabIndex={-1} className="m-0 text-section-heading">Permits and approvals to expect</h2>
          <PermitList permits={r.permits_likely_required} />
        </Band>
      </section>

      <section id="section-records" aria-labelledby="records" className="bg-band text-band-text">
        <Band className="flex flex-col gap-6 py-12">
          <h2 id="records" tabIndex={-1} className="m-0 text-section-heading">What Seattle&rsquo;s records show about businesses like yours</h2>
          <RecordsBand data={r.local_review_data as ReviewData | null | undefined} />
        </Band>
      </section>

      <div className="bg-paper">
        <Band className="flex flex-col gap-12 py-12">
          {check.notices?.length ? (
            <section aria-labelledby="notices" className="flex flex-col gap-2">
              <h2 id="notices" className="m-0 text-section-heading">Also note</h2>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
                {check.notices.map((n) => <li key={n} className="measure break-words">{n}</li>)}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="basis" className="flex flex-col gap-2 text-ink-muted">
            <h2 id="basis" className="m-0 text-body font-medium text-ink">Where the rules come from</h2>
            <p className="m-0 measure">{r.code_basis}</p>
          </section>
          <KeptUntil check={check} />
        </Band>
      </div>

      <section aria-labelledby="next-step" className="border-t border-hairline bg-paper">
        <Band className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 id="next-step" className="m-0 text-section-heading">Your next step</h2>
          <p className="m-0 measure">Take the fix list to your designer or architect, then apply to the city with the corrected plan.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href={reportUrl(check.id)} target="_blank" rel="noopener" data-main-action className="inline-flex min-h-12 items-center gap-2 rounded-full border border-blue bg-blue px-6 font-medium text-white no-underline hover:border-ink hover:bg-ink">
              <Download aria-hidden size={18} className="shrink-0" /> Download the fix list (PDF)
            </a>
          </div>
          <p className="m-0 measure">Questions about your space? Contact the <a href="https://www.seattle.gov/sdci" target="_blank" rel="noopener">Seattle Department of Construction and Inspections</a>.</p>
        </Band>
      </section>
      <div id="results-end" aria-hidden />

      {/* The rail sits in the right column of the same frame as every zone, sticky across all of them. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        <div className="band-pad h-full">
          <div className="results-frame h-full">
            <OnThisPageRail sections={sections} current={current} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A zone's inner column: the page's side margins, the results column (at most 880 px) and room for the rail. */
function Band({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="band-pad">
      <div className="results-frame">
        <div className={cn("results-column", className)}>{children}</div>
      </div>
    </div>
  );
}

/** Business type · size · address or zone · date, from the API's result. Each part stays on one line. */
function factsLine(check: Check): string[] {
  const r = check.result;
  const area = (r.extraction as { gross_area_sqft?: number | null } | undefined)?.gross_area_sqft;
  const z = r.zoning;
  const place = typeof z?.address === "string" && z.address.trim() ? z.address.trim() : z?.district ? `Zone ${z.district}` : null;
  return [r.summary.business_label, area ? `${formatNumber(area)} sq ft` : null, place, check.created_at ? formatDate(check.created_at) : null]
    .filter((x): x is string => !!x);
}

function FindingRows({ status, items, expanded, onShowAll }: { status: Status; items: Numbered[]; expanded: boolean; onShowAll: () => void }) {
  if (!items.length) {
    return (
      <p className="m-0 flex items-center gap-3 font-medium">
        <StatusIcon mark="none" /> {look(status).empty}
      </p>
    );
  }
  const shown = expanded ? items : items.slice(0, FIRST);
  const more = () => {
    onShowAll();
    // Move focus to the first finding that was hidden, so keyboard users carry on reading from there.
    requestAnimationFrame(() => document.getElementById(findingAnchor(items[FIRST].index))?.focus());
  };
  return (
    <div className="flex flex-col">
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map(({ finding, index }) => (
          <li key={index}><FindingCard finding={finding} index={index} actions={<AskAbout title={finding.title} />} /></li>
        ))}
      </ul>
      {shown.length < items.length ? (
        <div className="border-t border-hairline pt-6">
          <Button variant="secondary" onPress={more}>Show all {items.length}</Button>
        </div>
      ) : null}
    </div>
  );
}

function InShort({ check }: { check: Check }) {
  const s = check.result.summary;
  const tiles: [Status, number, string][] = [
    [FIX, s.fails, "to fix before you apply"],
    [TAB_GROUPS[0], s.reviews, "to check with the city"],
    [TAB_GROUPS[1], s.passes, s.passes === 1 ? "check with no issues found" : "checks with no issues found"],
  ];
  return (
    <div className="flex flex-col gap-6">
      <CountsSentence summary={s} />
      {usesUnverifiedRule(check.result.findings) ? <p className="m-0 measure">{SOME_UNVERIFIED}</p> : null}
      <div>
        <Button variant="primary" onPress={() => assistant.open()}><MessageCircleQuestion aria-hidden size={18} /> Ask about your result</Button>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3" aria-label="Counts">
        {tiles.map(([st, n, label]) => (
          <li key={st} className="flex flex-col items-start gap-2 rounded-2xl bg-white p-6">
            <StatusIcon mark={st === FIX && !n ? look(TAB_GROUPS[1]).mark : look(st).mark} size={24} />
            <span className={cn("text-page-heading nums", !(st === FIX && !n) && look(st).text)}>{formatNumber(n)}</span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Downloads({ check }: { check: Check }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <a href={reportUrl(check.id)} target="_blank" rel="noopener" data-main-action className="inline-flex min-h-12 w-full items-center gap-2 rounded-full border border-blue bg-blue px-6 py-2 font-medium text-white no-underline hover:border-ink hover:bg-ink sm:w-auto">
        <Download aria-hidden size={18} className="shrink-0" /> Download the fix list (PDF)
      </a>
      <a href={sheetUrl(check.id)} target="_blank" rel="noopener" className="inline-flex min-h-12 w-full items-center gap-2 rounded-full border border-field bg-white px-6 py-2 font-medium text-ink no-underline hover:border-ink sm:w-auto">
        <Download aria-hidden size={18} className="shrink-0" /> Download the permit preparation sheet (PDF)
      </a>
    </div>
  );
}

/** The API's zoning screen, or, when the address was not found, a way to try another (POST /api/zoning). */
function ZoningPanel({ check }: { check: Check }) {
  const z = check.result.zoning;
  const zw = z ? ZONING_WORDS[z.status] : null;
  const notFound = !z || !zw || (z.status === UNKNOWN_ZONING && !z.district);
  if (notFound) return <NoZoning check={check} />;
  const finding = check.result.findings.find((f) => f.rule_id === ZONING_RULE);
  return <ZoningFound z={z!} businessType={check.result.summary.business_type} finding={finding} />;
}

/**
 * The zoning screen. With its finding from the result: the code section, and the "still being checked" line when its
 * rule is unverified. A zoning found again (not in the result yet) has no finding, so it gets the careful line.
 */
function ZoningFound({ z, businessType, again, finding }: { z: NonNullable<Check["result"]["zoning"]>; businessType: string; again?: boolean; finding?: Finding }) {
  const zw = ZONING_WORDS[z.status];
  return (
    <div className="flex flex-col items-start gap-2" data-testid="zoning">
      <StatusTag status={zw.status} word={zw.word} />
      <p className="m-0"><span className="text-ink-muted">Zone: </span><span className="font-mono font-medium" translate="no">{z.district ?? "Not found"}</span></p>
      {typeof z.address === "string" && z.address.trim() ? <p className="m-0 break-words"><span className="text-ink-muted">Address: </span>{z.address}</p> : null}
      <p className="m-0 break-words measure">{z.detail}</p>
      {again ? <p className="m-0 measure">This is not in your result yet. Run the check again to include it.</p> : null}
      {typeof z.address === "string" && z.address.trim() ? <ZoningMap address={z.address} businessType={businessType} zone={z.district} /> : null}
      {overlayWords(z.overlays).length ? (
        <p className="m-0 break-words"><span className="text-ink-muted">Overlays: </span>{overlayWords(z.overlays).join(", ")}</p>
      ) : null}
      {typeof z.fix === "string" && z.fix ? <p className="m-0 break-words measure"><span className="font-medium">What to do: </span>{z.fix}</p> : null}
      {finding?.citation || typeof z.cite === "string" ? (
        <p className="m-0 font-mono text-ink-muted break-words" translate="no">{finding?.citation || (z.cite as string)}</p>
      ) : null}
      {!finding || ruleUnverified(finding) ? <p className="m-0 measure text-body text-ink-muted">{UNVERIFIED_FINDING}</p> : null}
    </div>
  );
}

const CITY_MAP = "https://seattlecitygis.maps.arcgis.com/apps/webappviewer/index.html?id=f822b2c6498c4163b0cf908e2241e9c2";

function NoZoning({ check }: { check: Check }) {
  const z = check.result.zoning;
  const given = typeof z?.address === "string" ? z.address.trim() : "";
  const [address, setAddress] = useState(given);
  const [state, setState] = useState<{ kind: "idle" | "looking" | "missing" | "problem" } | { kind: "found"; zoning: NonNullable<Check["result"]["zoning"]> }>({ kind: "idle" });
  const tryAgain = async () => {
    if (!address.trim()) return setState({ kind: "missing" });
    setState({ kind: "looking" });
    try {
      const res = await call(() => api.POST("/api/zoning", { body: { address: address.trim(), business_type: check.result.summary.business_type } }));
      const found = res.zoning as NonNullable<Check["result"]["zoning"]> | null | undefined;
      setState(found && found.district ? { kind: "found", zoning: { ...found, address: address.trim() } } : { kind: "missing" });
    } catch {
      setState({ kind: "problem" });
    }
  };
  if (state.kind === "found") return <ZoningFound z={state.zoning} businessType={check.result.summary.business_type} again />;
  return (
    <div className="flex flex-col items-start gap-4" data-testid="no-zoning">
      <p className="m-0 font-medium">{given ? "We couldn’t find zoning for this address" : "No address or zone was given, so zoning was not screened"}</p>
      <form className="flex w-full max-w-xl flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void tryAgain(); }}>
        <TextField label="Street address in Seattle" name="street-address" autoComplete="street-address" value={address} onChange={setAddress} spellCheck="false" />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="secondary" pending={state.kind === "looking"} isDisabled={state.kind === "looking"}>
            {state.kind === "looking" ? "Looking it up…" : "Try again"}
          </Button>
          <a href={CITY_MAP} target="_blank" rel="noopener">Find the zone on Seattle&rsquo;s property map</a>
        </div>
      </form>
      <p className="m-0" role="status">
        {state.kind === "missing" ? "We couldn’t find zoning for that address either. Check the spelling, or look the zone up on the city’s map." :
          state.kind === "problem" ? "The lookup didn’t answer. Try again in a moment." : ""}
      </p>
    </div>
  );
}

/** What Seattle's records show, in two groups and the review-time figure, each saying how many permits it is based on. */
function RecordsBand({ data }: { data: ReviewData | null | undefined }) {
  const g = recordGroups(data);
  if (!g) {
    return <p className="m-0 measure text-band-muted">Seattle&rsquo;s review records aren&rsquo;t loaded on this server, so there are no figures here on how similar projects went through review.</p>;
  }
  return (
    <div className="flex flex-col gap-8">
      {g.reviewTime ? (
        <p className="m-0 flex flex-col gap-1" data-testid="review-time">
          <span className="text-page-heading nums">{formatNumber(g.reviewTime.days)} days</span>
          <span className="text-band-muted">{g.reviewTime.words}</span>
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        {g.groups.map((grp) => (
          <section key={grp.title} aria-label={grp.title} className="flex flex-col gap-2">
            <h3 className="m-0 font-medium">{grp.title}</h3>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-6 nums">
              {grp.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <p className="m-0 text-band-muted">Tenant build-outs (additions and alterations) only. Source: {data?.source ?? "City of Seattle open data"}.</p>
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
      Ask about this <span aria-hidden>→</span>
    </Button>
  );
}

function overlayWords(overlays: unknown): string[] {
  if (!overlays || typeof overlays !== "object") return [];
  return Object.entries(overlays as Record<string, unknown>).filter(([, v]) => v).map(([k, v]) => (typeof v === "string" ? v : k.replace(/_/g, " ")));
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
      <h2 id="kept" className="m-0 text-body font-medium">Your check is kept for you</h2>
      <p className="m-0 measure">
        This check is kept until <time dateTime={check.expires_at}>{formatDate(check.expires_at)}</time>, so this page&rsquo;s address keeps working.
        Anyone with the address can open it. Your plan file itself was not kept.
      </p>
      <Button variant="danger" onPress={() => setOpen(true)}><Trash2 aria-hidden size={18} /> Delete this check now…</Button>
      <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="fixed inset-0 z-50 grid place-items-center overscroll-contain bg-ink/40 p-4">
        <Modal className="w-full max-w-lg rounded-2xl border border-hairline bg-white p-6">
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            <Heading slot="title" className="m-0 text-section-heading">Delete this check?</Heading>
            <p className="m-0">The results, the facts read from your plan and your answers are deleted from the server now. This cannot be undone.</p>
            {problem ? <p role="alert" className="m-0 font-medium text-fix">{problem}</p> : null}
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
