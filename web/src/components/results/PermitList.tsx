/**
 * The permits to expect, as the API listed them, in up to three columns with dashed rules. One that depends on an answer
 * left as "Not sure" says so (Q9). One the API lists because of a value still being checked against the code
 * (check_level "unchecked": the assembly and sprinkler permits rest on the number of people) says that, in muted text.
 */
import type { Permit } from "@/api/client";
import { StatusTag } from "./StatusTag";
import { CHECK_WITH_CITY } from "./status";
import { permitUnchecked, UNVERIFIED_ENTRY, UNVERIFIED_PERMIT } from "@/content/verification";

export function PermitList({ permits }: { permits: Permit[] }) {
  if (!permits.length) return <p className="m-0">No permits were listed for this check.</p>;
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {permits.map((p) => {
        const maybe = (p as Permit & { may_be_needed?: string | null }).may_be_needed;
        return (
          <li key={p.id} className="flex flex-col gap-1 border-t border-dashed border-field py-4">
            <span className="font-medium break-words">{p.name}</span>
            <span className="text-ink-muted break-words">{p.agency}</span>
            {permitUnchecked(p) ? <span className="text-ink-muted break-words">{UNVERIFIED_PERMIT}</span> : null}
            {p.entry_verified === false ? <span className="text-ink-muted break-words">{UNVERIFIED_ENTRY}</span> : null}
            {maybe ? (
              <span className="flex flex-col items-start gap-1">
                <StatusTag status={CHECK_WITH_CITY} word="May be needed" />
                <span className="break-words">{maybe}</span>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
