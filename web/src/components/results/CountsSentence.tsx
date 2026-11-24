/** One sentence of counts from the API's summary: "11 things to fix before you apply, 2 to check with the city, 6 fine". */
import type { Result } from "@/api/client";

export function countsSentence(s: Pick<Result["summary"], "fails" | "reviews" | "passes">): string {
  const fix = `${s.fails} ${s.fails === 1 ? "thing" : "things"} to fix before you apply`;
  return `${fix}, ${s.reviews} to check with the city, ${s.passes} fine`;
}

export function CountsSentence({ summary }: { summary: Pick<Result["summary"], "fails" | "reviews" | "passes"> }) {
  return <p className="m-0 text-section-heading font-normal nums" data-testid="counts">{countsSentence(summary)}.</p>;
}
