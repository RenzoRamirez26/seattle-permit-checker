/**
 * Turning one thing on the plan (a door, a room, the kitchen) into form text and back.
 * Shape checks only: required, "is a number", "is a whole number", trimming. No code values, no limits:
 * whether a value is enough is decided by the API. An empty number is "Not sure" and is sent as null,
 * never 0 or false.
 */
import { z } from "zod";
import type { FieldSpec } from "@/content/facts";

export type FormValues = Record<string, string>;
export type Item = Record<string, unknown>;

export function toFormValues(item: Item | null | undefined, fields: FieldSpec[]): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const v = item?.[f.key];
    if (f.kind === "yesno") out[f.key] = v === true ? "yes" : v === false ? "no" : f.nullable ? "unsure" : "no";
    else if (f.kind === "lines") out[f.key] = Array.isArray(v) ? v.join("\n") : "";
    else if (f.kind === "choice") out[f.key] = typeof v === "string" ? v : (f.choices?.[f.choices.length - 1]?.value ?? "");
    else out[f.key] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, "").replace(/\s+/g, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

function fieldSchema(f: FieldSpec) {
  return z.string().transform((raw, ctx) => {
    const text = raw.trim();
    switch (f.kind) {
      case "number":
      case "integer": {
        if (!text) {
          if (f.nullable) return null;
          ctx.addIssue({ code: "custom", message: `Enter the ${lower(f.label)}.` });
          return z.NEVER;
        }
        const n = parseNumber(text);
        if (n === null) {
          ctx.addIssue({ code: "custom", message: `Enter the ${lower(f.label)} as a number, or leave it empty if you're not sure.` });
          return z.NEVER;
        }
        if (f.kind === "integer" && !Number.isInteger(n)) {
          ctx.addIssue({ code: "custom", message: `Enter the ${lower(f.label)} as a whole number, or leave it empty if you're not sure.` });
          return z.NEVER;
        }
        return n;
      }
      case "yesno":
        return text === "yes" ? true : text === "no" ? false : null;
      case "lines":
        return raw.split("\n").map((l) => l.trim()).filter(Boolean);
      case "choice":
        return text;
      default:
        if (!text) {
          if (f.nullable) return null;
          ctx.addIssue({ code: "custom", message: `Enter the ${lower(f.label)}.` });
          return z.NEVER;
        }
        return text;
    }
  });
}

export function formSchema(fields: FieldSpec[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)])));
}

/** The item with the form's values in place; fields not in the form are kept as they were. */
export function fromFormValues(values: Record<string, unknown>, fields: FieldSpec[], before: Item | null | undefined): Item {
  const out: Item = { ...(before ?? {}) };
  for (const f of fields) out[f.key] = values[f.key];
  return out;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
