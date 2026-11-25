/**
 * The questions on step 1, in the owner's words. Words only. Each is answered Yes, No or Not sure;
 * "Not sure" and an unanswered optional question are sent as null, which the API treats as unknown (Q1, Q6).
 */
export type QuestionKey = "cooking_on_site" | "serves_alcohol" | "food_prep" | "outdoor_seating" | "upper_floor" | "historic_district" | "new_signage";

export const QUESTIONS: Record<QuestionKey, { label: string; short: string; hint?: string; missing: string }> = {
  cooking_on_site: {
    label: "Will there be cooking that makes grease or smoke?",
    short: "cooking that makes grease or smoke",
    hint: "For example a fryer, grill, range or wok. Reheating, coffee and toasting do not count.",
    missing: "Answer whether there will be cooking that makes grease or smoke, or choose Not sure.",
  },
  serves_alcohol: {
    label: "Will you serve alcohol?",
    short: "alcohol",
    missing: "Answer whether you will serve alcohol, or choose Not sure.",
  },
  food_prep: { label: "Will food be prepared on site?", short: "food prepared on site", hint: "Including sandwiches, salads or anything cut or assembled.", missing: "" },
  outdoor_seating: { label: "Will there be tables or chairs outside, on the sidewalk or a patio?", short: "seating outside", missing: "" },
  upper_floor: { label: "Is the space above or below the street-level floor?", short: "above or below street level", missing: "" },
  historic_district: { label: "Is the building a landmark, or in a historic district?", short: "landmark or historic district", hint: "Pioneer Square, the Pike Place Market and the International District are examples.", missing: "" },
  new_signage: { label: "Will you put up a new sign?", short: "a new sign", missing: "" },
};

export const OPTIONAL_FOR_FOOD: QuestionKey[] = ["outdoor_seating", "upper_floor", "historic_district", "new_signage"];
export const OPTIONAL_OTHERS: QuestionKey[] = ["food_prep", "outdoor_seating", "upper_floor", "historic_district", "new_signage"];

export const ADDRESS = {
  label: "Street address in Seattle (optional)",
  hint: "For example 1420 5th Ave. It is used to look up the zoning.",
  zoneLabel: "Zone from the zoning map (optional)",
  zoneHint: "Only if you know it, for example NC2-55 (M). Leave the address empty if you enter a zone.",
  both: "Enter an address or a zone, not both. Clear one of them.",
  notUsable: "Enter the street number and the street, for example 1420 5th Ave. Or leave the address empty.",
};

/** The notice on step 3 when an example plan's answers replaced the owner's (F2). */
export const EXAMPLE_ANSWERS = {
  heading: "The example plan uses its own answers",
  replaced: "They replaced your answers from step 1:",
  all: "See every answer on step 1",
  keep: "Keep my answers",
  kept: "Your answers from step 1 are kept. The check will use them with the example plan's measurements.",
};
