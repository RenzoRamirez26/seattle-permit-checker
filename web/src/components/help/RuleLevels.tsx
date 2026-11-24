"use client";
/**
 * Help's "How we check our rules": the three levels in words, and how many rules are at each level today from
 * /api/meta (rulebook.unchecked, transcribed, reviewed). Nothing is counted here; before /api/meta loads, the counts
 * line says nothing about how many are checked.
 */
import { useMeta } from "@/components/layout/Providers";
import { countsSentence, LEVELS_HELP } from "@/content/verification";
import { formatNumber } from "@/lib/format";

export function RuleLevels() {
  const { meta } = useMeta();
  const counts = meta?.rulebook;
  const h = LEVELS_HELP;
  return (
    <section id={h.id} aria-labelledby={`${h.id}-q`} className="flex flex-col gap-2">
      <h2 id={`${h.id}-q`} className="m-0 text-section-heading">{h.question}</h2>
      <p className="m-0 measure">{h.intro}</p>
      <dl className="m-0 flex flex-col gap-2">
        {h.levels.map((l) => (
          <div key={l.level} className="flex flex-col">
            <dt className="font-medium">
              {l.name}
              {counts ? <span className="nums text-ink-muted">{`: ${formatNumber(counts[l.level])} of ${formatNumber(counts.rules)} rules`}</span> : null}
            </dt>
            <dd className="m-0 measure">{l.text}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 measure">{h.dependsOn}</p>
      <p className="m-0 measure" aria-live="polite">{counts ? countsSentence(counts) : "Loading how many rules are at each level…"}</p>
    </section>
  );
}
