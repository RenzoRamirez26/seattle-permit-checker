"use client";
/**
 * Step 3's notice when an example plan's business answers replaced the owner's step 1 answers (F2).
 * In: the API's meta (for the business type's label and which questions it asks) and the answers in sessionStorage.
 * Out: a short note naming the example's answers, and "Keep my answers", which puts the owner's back.
 * Words only: the API decides what the answers mean.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import type { Meta } from "@/api/client";
import { questionsFor } from "@/app/business/BusinessPage";
import { Button } from "@/components/ui/button";
import { EXAMPLE_ANSWERS, QUESTIONS } from "@/content/business";
import { flow, type Answer, type Business } from "@/state/flow";

const word = (a: Answer) => (a === true ? "Yes" : a === false ? "No" : "Not sure");

/** "Café or restaurant; cooking that makes grease or smoke: Yes; alcohol: No; zone NC2-55 (M)". */
export function exampleAnswerWords(meta: Meta, b: Business): string {
  const type = meta.business_types.find((t) => t.key === b.business_type)?.label ?? b.business_type;
  const parts = [type, ...questionsFor(meta, b.business_type).required.map((k) => `${QUESTIONS[k].short}: ${word(b[k])}`)];
  if (b.address) parts.push(`address ${b.address}`);
  else if (b.zone) parts.push(`zone ${b.zone}`);
  return parts.join("; ");
}

export function ExampleAnswersNotice({ meta }: { meta: Meta | null }) {
  const [owner] = useState(() => flow.replacedBusiness());
  const [example] = useState(() => flow.business());
  const [kept, setKept] = useState(false);
  const status = useRef<HTMLParagraphElement>(null);

  if (kept) {
    return <p ref={status} role="status" tabIndex={-1} className="m-0 mb-8 border-l-2 border-field pl-4 measure outline-none">{EXAMPLE_ANSWERS.kept}</p>;
  }
  if (!owner || !example || !meta) return null;

  const keep = () => {
    flow.setBusiness(owner);
    setKept(true);
    requestAnimationFrame(() => status.current?.focus());     // the button is gone; say what happened where focus lands
  };

  return (
    <section aria-labelledby="example-answers" className="mb-8 flex flex-col items-start gap-3 border-l-2 border-field pl-4 measure">
      <h2 id="example-answers" className="m-0 text-body font-semibold">{EXAMPLE_ANSWERS.heading}</h2>
      <p className="m-0">
        {EXAMPLE_ANSWERS.replaced} {exampleAnswerWords(meta, example)}. <Link href="/business/">{EXAMPLE_ANSWERS.all}</Link>
      </p>
      <Button variant="secondary" onPress={keep}>{EXAMPLE_ANSWERS.keep}</Button>
    </section>
  );
}
