/**
 * The summary in words, from the API's counts (CONTENT.md: the action first, numbers, no verdict):
 * "You have 11 things to fix before you apply and 2 to check with the city." and, when there are any,
 * "We found no issues in the other 6 checks."
 */
import type { Result } from "@/api/client";
import { formatNumber } from "@/lib/format";

type Counts = Pick<Result["summary"], "fails" | "reviews" | "passes">;
const things = (n: number) => `${formatNumber(n)} ${n === 1 ? "thing" : "things"}`;

export function countsSentence(s: Counts): string {
  if (s.fails && s.reviews) return `You have ${things(s.fails)} to fix before you apply and ${formatNumber(s.reviews)} to check with the city.`;
  if (s.fails) return `You have ${things(s.fails)} to fix before you apply.`;
  if (s.reviews) return `Nothing to fix before you apply. You have ${things(s.reviews)} to check with the city.`;
  return "Nothing to fix before you apply, and nothing to check with the city.";
}

export function othersSentence(s: Counts): string | null {
  if (!s.passes) return null;
  return `We found no issues in the other ${formatNumber(s.passes)} ${s.passes === 1 ? "check" : "checks"}.`;
}

export function CountsSentence({ summary }: { summary: Counts }) {
  const others = othersSentence(summary);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-section-heading font-normal nums" data-testid="counts">{countsSentence(summary)}</p>
      {others ? <p className="m-0 nums" data-testid="others">{others}</p> : null}
    </div>
  );
}
