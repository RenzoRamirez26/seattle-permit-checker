/**
 * One finding as a plain row (DESIGN.md, Findings): the status icon, the action title, the observation the API sent
 * (D5: one sentence, not split in the browser), how to fix it, who to ask in Seattle for a "Check with the city"
 * item, and the code section with "Ask about this". Its anchor is finding-<index>, its position in the result.
 */
import type { Finding } from "@/api/client";
import { groupOf, look, TAB_GROUPS } from "./status";
import { StatusIcon } from "./StatusIcon";

export const findingAnchor = (index: number) => `finding-${index}`;

export function FindingCard({ finding, index, actions }: { finding: Finding; index: number; actions?: React.ReactNode }) {
  const l = look(finding.status);
  const id = findingAnchor(index);
  const askCity = groupOf(finding.status) === TAB_GROUPS[0];
  return (
    <article id={id} aria-labelledby={`${id}-title`} tabIndex={-1} className="flex gap-4 border-t border-hairline py-6 outline-offset-4">
      <StatusIcon mark={l.mark} className="mt-0.5" />
      <div className="flex min-w-0 flex-col gap-2">
        <h3 id={`${id}-title`} className="m-0 text-body font-medium break-words">
          <span className="sr-only">{l.word}: </span>{finding.title}
        </h3>
        <p className="m-0 measure nums break-words">{finding.detail}</p>
        {finding.fix ? <p className="m-0 measure break-words">{finding.fix}</p> : null}
        {askCity && finding.reviewed_by ? <p className="m-0 measure break-words text-ink-muted">Who to ask: {finding.reviewed_by}</p> : null}
        <p className="m-0 flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="font-mono text-ink-muted break-words" translate="no">{finding.citation}</span>
          {actions}
        </p>
      </div>
    </article>
  );
}
