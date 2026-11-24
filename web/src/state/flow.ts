/**
 * What the owner has entered, kept in sessionStorage (this tab only, one key per step) so Back and a refresh
 * keep it. "Start again" clears it. The uploaded plan file is kept in memory only, never in storage, so the
 * promise that plans are not saved holds (D12).
 */
import type { Facts, PlanReading } from "@/api/client";

export type Answer = boolean | null;   // Yes, No, or Not sure

export type Business = {
  business_type: string;
  cooking_on_site: Answer;
  food_prep: Answer;
  serves_alcohol: Answer;
  outdoor_seating: Answer;
  upper_floor: Answer;
  historic_district: Answer;
  new_signage: Answer;
  address: string;
  zone: string;
};

/** The reading the facts came from: the API's PlanReading, or the owner entering everything by hand. */
export type Reading = Pick<PlanReading, "source_label" | "case_id"> & {
  source: PlanReading["source"] | "manual";
  facts: Facts;
  file_name?: string | null;
  file_type?: string | null;
};

const KEYS = {
  business: "precheck.business", reading: "precheck.reading", facts: "precheck.facts", check: "precheck.check",
  fromExample: "precheck.business.example", replaced: "precheck.business.replaced",
} as const;

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the page still works, a refresh will not keep the entry */
  }
}

export const flow = {
  business: () => read<Business>(KEYS.business),
  /** The owner's own answers (step 1, or "Keep my answers"): any answers an example replaced are no longer needed. */
  setBusiness: (b: Business | null) => {
    write(KEYS.business, b);
    write(KEYS.fromExample, null);
    write(KEYS.replaced, null);
  },
  /**
   * An example plan's answers. If they replace answers the owner gave on step 1, those are kept aside so step 3 can
   * say so and offer "Keep my answers". Answers set by an earlier example are not the owner's, so they are not kept.
   */
  setExampleBusiness: (b: Business) => {
    const owner = read<Business>(KEYS.replaced) ?? (read<boolean>(KEYS.fromExample) ? null : read<Business>(KEYS.business));
    write(KEYS.replaced, owner && !sameBusiness(owner, b) ? owner : null);
    write(KEYS.business, b);
    write(KEYS.fromExample, true);
  },
  /** The owner's step 1 answers that an example plan replaced, or null. */
  replacedBusiness: () => read<Business>(KEYS.replaced),
  reading: () => read<Reading>(KEYS.reading),
  /** A new reading replaces the facts with the ones just read. */
  setReading: (r: Reading | null) => {
    write(KEYS.reading, r);
    write(KEYS.facts, r ? r.facts : null);
  },
  facts: () => read<Facts>(KEYS.facts),
  setFacts: (f: Facts | null) => write(KEYS.facts, f),
  checkId: () => read<string>(KEYS.check),
  setCheckId: (id: string | null) => write(KEYS.check, id),
  /** The step 1 form as typed (so an unanswered question stays unanswered after Back or a refresh). */
  clearBusinessDraft: () => write("precheck.business.draft", null),
  /** "Start again": everything this tab kept, and the plan file in memory. */
  clear: () => {
    try {
      for (const k of Object.keys(window.sessionStorage)) if (k.startsWith("precheck.")) window.sessionStorage.removeItem(k);
    } catch {
      /* storage blocked: nothing was kept */
    }
    planFile.clear();
  },
};

const BUSINESS_KEYS: (keyof Business)[] = ["business_type", "cooking_on_site", "food_prep", "serves_alcohol", "outdoor_seating",
  "upper_floor", "historic_district", "new_signage", "address", "zone"];
export function sameBusiness(a: Business, b: Business): boolean {
  return BUSINESS_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/** Every fact empty ("Not sure"): the owner enters the measurements by hand. */
export function emptyFacts(): Facts {
  return {
    plan_title: null, scale_note: null, overall_width_ft: null, overall_length_ft: null, gross_area_sqft: null,
    spaces: [], seat_count: null, accessible_seat_count: null, doors: [], aisles: [], restrooms: [],
    kitchen: null, fire_safety: null, outdoor_seating_shown: null, uncertainties: [],
  };
}

/** The plan the owner chose, in memory only. Lost on refresh by design (D12). */
let current: File | null = null;
const listeners = new Set<() => void>();
export const planFile = {
  get: () => current,
  set: (f: File | null) => {
    current = f;
    listeners.forEach((l) => l());
  },
  clear: () => planFile.set(null),
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
