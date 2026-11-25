"use client";
/**
 * Step 1, "What kind of business is it?": the six business types from /api/meta as radio cards; cooking for
 * food businesses, alcohol for food and bar types; the other questions under "A few more questions (optional)";
 * the address or the zone. Every answer is kept in sessionStorage as it is typed, so Back and a refresh keep it.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Disclosure, DisclosurePanel, Heading, Button as AriaButton } from "react-aria-components";
import { ChevronDown } from "lucide-react";
import type { Meta } from "@/api/client";
import { ErrorSummary, type ProblemItem } from "@/components/flow/ErrorSummary";
import { fromTri, toTri, YesNoNotSure, type Tri } from "@/components/flow/YesNoNotSure";
import { useMeta } from "@/components/layout/Providers";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { TextField } from "@/components/ui/text-field";
import { ADDRESS, OPTIONAL_FOR_FOOD, OPTIONAL_OTHERS, QUESTIONS, type QuestionKey } from "@/content/business";
import { errorWords } from "@/api/errors";
import { AddressCheck } from "@/components/map/AddressCheck";
import { flow, type Business } from "@/state/flow";
import { cn } from "@/lib/utils";

type Values = { business_type: string; address: string; zone: string } & Record<QuestionKey, Tri>;
const KEYS: QuestionKey[] = ["cooking_on_site", "serves_alcohol", "food_prep", "outdoor_seating", "upper_floor", "historic_district", "new_signage"];

/** What was saved, as form values. An optional question never answered is "" (shown unanswered, sent as null). */
function initial(): Values {
  const b = flow.business();
  const draft = readDraft();
  if (draft) return draft;
  const v: Values = { business_type: b?.business_type ?? "", address: b?.address ?? "", zone: b?.zone ?? "" } as Values;
  for (const k of KEYS) v[k] = b ? toTri(b[k], true) : "";
  return v;
}

const DRAFT = "precheck.business.draft";
function readDraft(): Values | null {
  try {
    const raw = sessionStorage.getItem(DRAFT);
    return raw ? (JSON.parse(raw) as Values) : null;
  } catch {
    return null;
  }
}
function writeDraft(v: Values) {
  try {
    sessionStorage.setItem(DRAFT, JSON.stringify(v));
  } catch {
    /* storage blocked: a refresh will not keep the draft */
  }
}

/** Which questions this business type asks. Which types serve food or alcohol comes from the API. */
export function questionsFor(meta: Meta | null, key: string) {
  const t = meta?.business_types.find((b) => b.key === key);
  if (!t) return { required: [] as QuestionKey[], optional: [] as QuestionKey[] };
  const required: QuestionKey[] = [];
  if (t.serves_food) required.push("cooking_on_site");
  if (t.serves_food || t.serves_alcohol) required.push("serves_alcohol");
  return { required, optional: t.serves_food ? OPTIONAL_FOR_FOOD : OPTIONAL_OTHERS };
}

/** The answers to save. A question this business type does not ask is "no"; an optional one left unanswered is null. */
export function toBusiness(v: Values, meta: Meta | null): Business {
  const { required, optional } = questionsFor(meta, v.business_type);
  const answer = (k: QuestionKey): boolean | null => {
    if (required.includes(k)) return fromTri(v[k]);
    if (optional.includes(k)) return v[k] ? fromTri(v[k]) : null;
    return false;
  };
  return {
    business_type: v.business_type,
    cooking_on_site: answer("cooking_on_site"), serves_alcohol: answer("serves_alcohol"), food_prep: answer("food_prep"),
    outdoor_seating: answer("outdoor_seating"), upper_floor: answer("upper_floor"), historic_district: answer("historic_district"),
    new_signage: answer("new_signage"), address: v.address.trim(), zone: v.zone.trim(),
  };
}

/** An address the API will look up: a street number and a street name, within the API's length limit. */
export function addressUsable(address: string, meta: Pick<Meta, "limits"> | null): boolean {
  const a = address.trim();
  return a.length <= (meta?.limits.max_address_chars ?? 200) && /\d/.test(a) && /[a-z]/i.test(a);
}

/** submitLabel: Start's one call to action is "Start the pre-check"; step 1 on its own page says "Continue". */
export function BusinessForm({ submitLabel = "Continue" }: { submitLabel?: string } = {}) {
  const router = useRouter();
  const { meta, problem: metaProblem } = useMeta();
  const [problems, setProblems] = useState<ProblemItem[]>([]);
  const { control, handleSubmit, getValues } = useForm<Values>({ defaultValues: initial() });
  const values = useWatch({ control });
  const type = values.business_type ?? "";
  const { required, optional } = questionsFor(meta, type);
  const optionalAnswered = optional.some((k) => values[k]);
  const summary = useRef<HTMLDivElement>(null);
  const [placeAddress, setPlaceAddress] = useState(() => getValues("address").trim());   // looked up when the field is left

  useEffect(() => {
    writeDraft(getValues());
  }, [values, getValues]);

  const validate = (v: Values): ProblemItem[] => {
    const out: ProblemItem[] = [];
    if (!v.business_type) out.push({ id: "business_type", text: "Choose the kind of business.", href: "#business_type" });
    for (const k of questionsFor(meta, v.business_type).required) {
      if (!v[k]) out.push({ id: k, text: QUESTIONS[k].missing, href: `#${k}` });
    }
    if (v.address.trim() && v.zone.trim()) out.push({ id: "zone", text: ADDRESS.both, href: "#zone" });
    if (v.address.trim() && !addressUsable(v.address, meta))
      out.push({ id: "address", text: ADDRESS.notUsable, href: "#address" });       // the API refuses the same addresses
    return out;
  };

  const submit = handleSubmit((v) => {
    const found = validate(v);
    setProblems(found);
    if (found.length) {
      const el = document.getElementById(found[0].id!);
      (el?.querySelector<HTMLElement>("input:checked, input") ?? el)?.focus();
      return;
    }
    flow.setBusiness(toBusiness(v, meta));
    router.push("/plan/");
  });

  const errorFor = (id: string) => problems.find((p) => p.id === id)?.text;
  const recheck = () => problems.length && setProblems(validate(getValues()));

  if (!meta) {
    return metaProblem ? <p role="alert" className="m-0">{errorWords(metaProblem)}</p> : <p className="m-0" aria-live="polite">Loading the questions…</p>;
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-12">
      <ErrorSummary ref={summary} items={problems} />
      <Controller name="business_type" control={control} render={({ field }) => (
        <div id="business_type">
          <RadioGroup label="Kind of business" cards name="business_type" value={field.value || null} error={errorFor("business_type")}
            onChange={(v) => { field.onChange(v); queueMicrotask(recheck); }}
            choices={meta.business_types.map((t) => ({ value: t.key, label: t.label }))} />
        </div>
      )} />

      {required.map((k) => (
        <Controller key={k} name={k} control={control} render={({ field }) => (
          <YesNoNotSure id={k} label={QUESTIONS[k].label} hint={QUESTIONS[k].hint} error={errorFor(k)} value={field.value}
            onChange={(v) => { field.onChange(v); queueMicrotask(recheck); }} />
        )} />
      ))}

      <div className="flex flex-col gap-6">
        <Controller name="address" control={control} render={({ field }) => (
          <div id="address">
            <TextField label={ADDRESS.label} hint={ADDRESS.hint} name="street-address" autoComplete="street-address"
              value={field.value} onChange={(v) => { field.onChange(v); queueMicrotask(recheck); }} spellCheck="false"
              error={errorFor("address")} maxLength={meta.limits.max_address_chars}
              onBlur={() => { field.onBlur(); setPlaceAddress(field.value.trim()); }} />
          </div>
        )} />
        {placeAddress && placeAddress === (values.address ?? "").trim() && addressUsable(placeAddress, meta) ? <AddressCheck address={placeAddress} businessType={type} /> : null}
        <Controller name="zone" control={control} render={({ field }) => (
          <div id="zone">
            <TextField label={ADDRESS.zoneLabel} hint={ADDRESS.zoneHint} name="zone" autoComplete="off" error={errorFor("zone")}
              value={field.value} onChange={(v) => { field.onChange(v); queueMicrotask(recheck); }} onBlur={field.onBlur}
              inputClassName="max-w-64" spellCheck="false" />
          </div>
        )} />
      </div>

      {type ? (
        <Disclosure defaultExpanded={optionalAnswered} className="border-t border-b border-hairline">
          {({ isExpanded }) => (
            <>
              <Heading level={2} className="m-0">
                <AriaButton slot="trigger" className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 py-2 text-left text-section-heading font-medium">
                  A few more questions (optional)
                  <ChevronDown aria-hidden size={24} className={cn("shrink-0", isExpanded && "rotate-180")} />
                </AriaButton>
              </Heading>
              <DisclosurePanel>
                <div className="flex flex-col gap-8 pb-8 pt-2">
                  <p className="m-0 text-ink-muted">Each of these can add a permit. Anything you leave unanswered is treated as Not sure.</p>
                  {optional.map((k) => (
                    <Controller key={k} name={k} control={control} render={({ field }) => (
                      <YesNoNotSure id={k} label={QUESTIONS[k].label} hint={QUESTIONS[k].hint} value={field.value} onChange={field.onChange} />
                    )} />
                  ))}
                </div>
              </DisclosurePanel>
            </>
          )}
        </Disclosure>
      ) : null}

      <div>
        <Button type="submit" variant="primary">{submitLabel}</Button>
      </div>
    </form>
  );
}
