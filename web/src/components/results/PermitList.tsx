/** The permits to expect, as the API listed them. One that depends on an answer left as "Not sure" says so (Q9). */
import type { Permit } from "@/api/client";
import { StatusTag } from "./StatusTag";
import { CHECK_WITH_CITY } from "./status";

export function PermitList({ permits }: { permits: Permit[] }) {
  if (!permits.length) return <p className="m-0">No permits were listed for this check.</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {permits.map((p) => {
        const maybe = (p as Permit & { may_be_needed?: string | null }).may_be_needed;
        return (
          <li key={p.id} className="flex flex-col gap-1 border-t border-hairline py-4">
            <span className="font-medium break-words">{p.name}</span>
            <span className="text-ink-muted break-words">{p.agency}</span>
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
