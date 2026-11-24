"use client";
/**
 * One finding as the API sent it: status tag, title, the detail sentence (D5: one sentence, not split in the
 * browser), how to fix it, who checks it in Seattle, and the code reference behind a disclosure.
 * Its anchor is finding-<index>, its position in the result (rule ids repeat).
 */
import { Disclosure, DisclosurePanel, Button as AriaButton } from "react-aria-components";
import { ChevronDown } from "lucide-react";
import type { Finding } from "@/api/client";
import { cn } from "@/lib/utils";
import { look } from "./status";
import { StatusTag } from "./StatusTag";

export const findingAnchor = (index: number) => `finding-${index}`;

export function FindingCard({ finding, index, actions }: { finding: Finding; index: number; actions?: React.ReactNode }) {
  const l = look(finding.status);
  const id = findingAnchor(index);
  return (
    <article id={id} aria-labelledby={`${id}-title`} className={cn("border-l-4 bg-white p-4 sm:p-6", l.border)} tabIndex={-1}>
      <div className="flex flex-col items-start gap-2">
        <StatusTag status={finding.status} />
        <h3 id={`${id}-title`} className="m-0 text-body font-semibold break-words">{finding.title}</h3>
      </div>
      <p className="m-0 mt-2 measure nums break-words">{finding.detail}</p>
      {finding.fix ? (
        <p className="m-0 mt-4 measure break-words"><span className="font-semibold">How to fix it: </span>{finding.fix}</p>
      ) : null}
      {finding.reviewed_by ? (
        <p className="m-0 mt-2 text-small text-ink-muted">Checked in Seattle&rsquo;s plan review by: {finding.reviewed_by}</p>
      ) : null}
      <Disclosure className="mt-4">
        {({ isExpanded }) => (
          <>
            <AriaButton slot="trigger" className="-mx-2 inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-blue underline decoration-1 underline-offset-[3px]">
              {isExpanded ? "Hide the code reference" : "Show the code reference"}
              <ChevronDown aria-hidden size={18} className={cn(isExpanded && "rotate-180")} />
            </AriaButton>
            <DisclosurePanel>
              <p className="m-0 mt-2 font-mono text-small break-words" translate="no">{finding.citation}</p>
            </DisclosurePanel>
          </>
        )}
      </Disclosure>
      {actions ? <div className="mt-2">{actions}</div> : null}
    </article>
  );
}
