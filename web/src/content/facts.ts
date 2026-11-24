/**
 * How each fact read from the plan is named and entered, in the owner's words. Words only: no code
 * values, no limits, no judgement of what is enough. The fields mirror Facts in src/api/schema.d.ts
 * (a test checks every field has a label here).
 */
import type { Facts, Meta } from "@/api/client";

export type Kind = "number" | "integer" | "text" | "yesno" | "choice" | "lines";

export type FieldSpec = {
  key: string;
  label: string;
  kind: Kind;
  /** A unit word shown after the value. */
  unit?: string;
  hint?: string;
  /** Choices for kind "choice". The value "unknown" is how the plan reader says it could not tell. */
  choices?: { value: string; label: string }[];
  /** false for facts the plan always has (a door's name, whether it is an exit). Otherwise empty means "Not sure". */
  nullable: boolean;
  /** The question the change form asks, where it reads better than the label (a room's use). */
  question?: string;
  /** Shown as the row's name rather than as a fact. */
  isName?: boolean;
  /** Where on the plan, in words. */
  isWhere?: boolean;
};

export type ListKey = "spaces" | "doors" | "aisles" | "restrooms";
export type ObjectKey = "kitchen" | "fire_safety";
export type GroupSpec =
  | { id: string; title: string; kind: "list"; key: ListKey; itemWord: string; addLabel: string; fields: FieldSpec[]; blank: () => Record<string, unknown> }
  | { id: string; title: string; kind: "object"; key: ObjectKey; rowTitle: string; fields: FieldSpec[] }
  | { id: string; title: string; kind: "top"; rowTitle: string; fields: FieldSpec[] };

const FT = "ft";
const IN = "in.";

export const SPACE_USE_WORDS: Record<string, string> = {
  dining: "Dining (tables and chairs)",
  standing: "Standing room",
  counter_service: "Counter or queue",
  kitchen: "Kitchen",
  retail: "Shop floor",
  service: "Service area (salon chairs, treatment rooms)",
  exercise: "Exercise room",
  waiting: "Waiting area",
  office: "Office",
  storage: "Storage",
  restroom: "Restroom",
  corridor: "Corridor",
  other: "Other",
};

export const GROUPS: GroupSpec[] = [
  {
    id: "overall", title: "Overall size", kind: "top", rowTitle: "The whole space",
    fields: [
      { key: "plan_title", label: "Title on the plan", kind: "text", nullable: true },
      { key: "scale_note", label: "Scale note", kind: "text", nullable: true },
      { key: "overall_width_ft", label: "Overall width", kind: "number", unit: FT, nullable: true },
      { key: "overall_length_ft", label: "Overall length", kind: "number", unit: FT, nullable: true },
      { key: "gross_area_sqft", label: "Total floor area", kind: "number", unit: "sq ft", nullable: true },
    ],
  },
  {
    id: "rooms", title: "Rooms", kind: "list", key: "spaces", itemWord: "room", addLabel: "Add a room",
    blank: () => ({ name: "New room", use: null, area_sqft: null, width_ft: null, length_ft: null }),
    fields: [
      { key: "name", label: "Name", kind: "text", nullable: false, isName: true },
      { key: "use", label: "Used for", question: "What is this room used for?", kind: "choice", nullable: true,
        choices: Object.entries(SPACE_USE_WORDS).map(([value, label]) => ({ value, label })) },
      { key: "area_sqft", label: "Floor area", kind: "number", unit: "sq ft", nullable: true },
      { key: "width_ft", label: "Width", kind: "number", unit: FT, nullable: true },
      { key: "length_ft", label: "Length", kind: "number", unit: FT, nullable: true },
    ],
  },
  {
    id: "doors", title: "Doors", kind: "list", key: "doors", itemWord: "door", addLabel: "Add a door",
    blank: () => ({ label: "New door", location: null, clear_width_in: null, is_exit: false, swing: "unknown", serves: null }),
    fields: [
      { key: "label", label: "Name", kind: "text", nullable: false, isName: true },
      { key: "location", label: "Where on the plan", kind: "text", nullable: true, isWhere: true },
      { key: "clear_width_in", label: "Clear width", kind: "number", unit: IN, nullable: true,
        hint: "The gap between the frame and the open door, not the width of the door itself." },
      { key: "is_exit", label: "Is it an exit to the outside?", kind: "yesno", nullable: false },
      { key: "swing", label: "Which way it opens", kind: "choice", nullable: false, choices: [
        { value: "outward", label: "Outward, away from the room" },
        { value: "inward", label: "Inward, into the room" },
        { value: "sliding", label: "Sliding" },
        { value: "unknown", label: "Not sure" },
      ] },
      { key: "serves", label: "Leads to", kind: "text", nullable: true },
    ],
  },
  {
    id: "aisles", title: "Aisles and routes", kind: "list", key: "aisles", itemWord: "aisle", addLabel: "Add an aisle or route",
    blank: () => ({ label: "New aisle", min_width_in: null }),
    fields: [
      { key: "label", label: "Name", kind: "text", nullable: false, isName: true },
      { key: "min_width_in", label: "Narrowest width", kind: "number", unit: IN, nullable: true },
    ],
  },
  {
    id: "restrooms", title: "Restrooms", kind: "list", key: "restrooms", itemWord: "restroom", addLabel: "Add a restroom",
    blank: () => ({ label: "New restroom", designation: "unknown", water_closets: null, urinals: null, lavatories: null,
      turning_circle_diameter_in: null, door_clear_width_in: null }),
    fields: [
      { key: "label", label: "Name", kind: "text", nullable: false, isName: true },
      { key: "designation", label: "Who it is for", kind: "choice", nullable: false, choices: [
        { value: "all_gender", label: "Everyone (all-gender)" },
        { value: "women", label: "Women" },
        { value: "men", label: "Men" },
        { value: "unknown", label: "Not marked" },
      ] },
      { key: "water_closets", label: "Toilets", kind: "integer", nullable: true },
      { key: "urinals", label: "Urinals", kind: "integer", nullable: true },
      { key: "lavatories", label: "Washbasins", kind: "integer", nullable: true },
      { key: "turning_circle_diameter_in", label: "Wheelchair turning circle", kind: "number", unit: IN, nullable: true,
        hint: "Measured across the circle drawn in the room." },
      { key: "door_clear_width_in", label: "Door clear width", kind: "number", unit: IN, nullable: true },
    ],
  },
  {
    id: "kitchen", title: "Kitchen", kind: "object", key: "kitchen", rowTitle: "Kitchen and food preparation",
    fields: [
      { key: "cooking_appliances", label: "Cooking equipment", kind: "lines", nullable: false, hint: "One item per line." },
      { key: "grease_producing_cooking", label: "Cooking that makes grease or smoke (fryer, grill, range)", kind: "yesno", nullable: true },
      { key: "type1_hood_shown", label: "Exhaust hood over the cooking line", kind: "yesno", nullable: true },
      { key: "hand_sinks", label: "Handwashing sinks", kind: "integer", nullable: true },
      { key: "three_compartment_sink", label: "Three-compartment dish sink", kind: "yesno", nullable: true },
      { key: "mop_or_service_sink", label: "Mop or service sink", kind: "yesno", nullable: true },
      { key: "grease_interceptor_shown", label: "Grease interceptor", kind: "yesno", nullable: true },
    ],
  },
  {
    id: "fire", title: "Fire safety", kind: "object", key: "fire_safety", rowTitle: "Fire safety on the plan",
    fields: [
      { key: "exit_signs_shown", label: "Exit signs", kind: "integer", nullable: true },
      { key: "fire_extinguishers_shown", label: "Fire extinguishers", kind: "integer", nullable: true },
      { key: "class_k_extinguisher_shown", label: "Kitchen (Class K) extinguisher", kind: "yesno", nullable: true },
      { key: "sprinklers_noted", label: "Sprinklers noted", kind: "yesno", nullable: true },
      { key: "emergency_lighting_noted", label: "Emergency lighting noted", kind: "yesno", nullable: true },
    ],
  },
  {
    id: "seats", title: "Seats", kind: "top", rowTitle: "Customer seating",
    fields: [
      { key: "seat_count", label: "Seats", kind: "integer", nullable: true },
      { key: "accessible_seat_count", label: "Seats at accessible tables", kind: "integer", nullable: true },
      { key: "outdoor_seating_shown", label: "Outdoor seating shown", kind: "yesno", nullable: true },
    ],
  },
];

/** Facts fields that are lists of things shown elsewhere, not entered as rows. */
export const NOT_A_ROW: (keyof Facts)[] = ["uncertainties"];

export const SOURCE_WORDS: Record<string, string> = {
  saved_reading: "The saved reading for this example plan. No model was used.",
  vision_model: "The model read your plan. Check each value against the drawing.",
  manual: "You're entering the measurements yourself. Leave anything you're not sure of empty.",
};

export const NOT_SURE = "Not sure";

/** The Answers page (step 3): its groups, notes and messages. Words only. */
export const ANSWERS = {
  intro: "Change anything that's wrong. Any check that needs a value left as Not sure becomes Check with the city, unless the rest of the plan already shows something to fix.",
  checkFirst: "Check these first",
  /**
   * Under a row the reading left empty. The API marks no single reading as uncertain (its `uncertainties` is a free-text
   * list, shown as "Noted while reading your plan"), so there is no "not sure we read this right" line.
   */
  emptyLine: "We couldn't read this from your plan.",
  notes: "Noted while reading your plan",
  alsoUsed: "Also read from your plan",
  /** Manual entry: nothing was read, so there is nothing to check first. */
  used: "Your measurements",
  /** A reading with nothing left empty: one group. */
  usedAll: "Read from your plan",
  allAbove: "Listed above, under Check these first.",
  noneRead: "None read from your plan.",
  noneEntered: "None added yet.",
  changed: "Changed by you. The check uses your values.",
  where: "Where",
  notMarked: "not marked on the plan",
  selected: "Selected",
  emptyHint: "Leave it empty if you're not sure.",
  business: "About your business",
  businessType: "Kind of business",
  address: "Address",
  zone: "Zone",
  noPlace: "Address or zone",
  notGiven: "Not given",
  change: "Change",
  changeLabel: "Change your answers about your business",
  noBusiness: "You haven't answered the questions about your business yet.",
  answerThem: "Answer them",
  runNote: "The check uses these values, including your changes. Values marked not checked are kept with your check, but no rule reads them.",
  /** Beside a value no rule reads (/api/meta facts_checked). */
  notChecked: "not checked",
  run: "Run the check",
  running: "Running the check…",
  runningStatus: "Running the rules on your readings…",
  needBusiness: "Answer what kind of business it is first.",
  saveFirst: "Save or cancel your change first.",
};

/**
 * Whether a rule reads this value, from /api/meta: facts_checked lists them as "field" or "group.field", and a room
 * whose use is in room_uses_without_load (restrooms, corridors) has no size a rule reads. Names and "where" words are
 * descriptions, not values. Before /api/meta loads, every value counts as read, so nothing is marked.
 */
export function readByRules(meta: Meta | null | undefined, g: GroupSpec, f: FieldSpec, item: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return !f.isName && !f.isWhere;
  if (f.isName || f.isWhere) return false;
  const path = g.kind === "top" ? f.key : `${g.key}.${f.key}`;
  if (!meta.facts_checked.includes(path)) return false;
  const sized = g.kind === "list" && g.key === "spaces" && ["area_sqft", "width_ft", "length_ft"].includes(f.key);
  return !(sized && typeof item?.use === "string" && meta.room_uses_without_load.includes(item.use));
}
