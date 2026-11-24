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

const KEYS = { business: "precheck.business", reading: "precheck.reading", facts: "precheck.facts", check: "precheck.check" } as const;

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
  setBusiness: (b: Business | null) => write(KEYS.business, b),
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
