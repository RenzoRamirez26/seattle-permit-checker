"use client";
/** A Yes / No / Not sure question. "Not sure" is a real answer: it is sent as null and becomes "Check with the city". */
import { RadioGroup } from "@/components/ui/radio-group";

export type Tri = "yes" | "no" | "unsure" | "";

export const toTri = (v: boolean | null | undefined, answered = true): Tri => (v === true ? "yes" : v === false ? "no" : answered ? "unsure" : "");
export const fromTri = (t: Tri): boolean | null => (t === "yes" ? true : t === "no" ? false : null);

export function YesNoNotSure({ id, label, hint, error, value, onChange }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  return (
    <div id={id}>
      <RadioGroup label={label} hint={hint} error={error} value={value || null} onChange={(v) => onChange(v as Tri)} name={id}
        orientation="horizontal" choices={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }]} />
    </div>
  );
}
