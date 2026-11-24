/**
 * The assistant's fixed help text: what it answers before a result exists (no request is made), and the /help
 * page. Words only: no code values, no rules. Each topic has the words a typed question is matched on.
 */
export type HelpTopic = { id: string; question: string; answer: string; words: string[] };

export const HELP: HelpTopic[] = [
  {
    id: "what", question: "What does the pre-check look at?",
    answer: "It reads your floor plan for rooms and their sizes, doors and exits, aisles, restrooms, the kitchen and fire safety, then checks those facts against rules we coded from Seattle's building and plumbing codes, the federal accessibility standards and, for food businesses, King County's food code. Each result says how far each rule is checked against the code. It also lists the permits a business like yours usually needs and, when you give an address or a zone, screens the zoning. It checks for a kitchen exhaust hood where there is cooking, but not ventilation rates, structure, energy, electrical or anything outside your space.",
    words: ["look", "check", "what does", "cover", "rules", "codes"],
  },
  {
    id: "rule-levels", question: "How do you check your rules?",
    answer: "Every rule has one of three levels: still being checked (coded from the code but not yet compared with the code text), checked against the code text by our team, or reviewed by an expert, with their name, role and the date. A finding takes the lowest level of the rules it uses. The level never changes a result. Help lists how many rules are at each level today, and each finding on your results says its level.",
    words: ["how do you check", "verified", "accurate", "expert", "reviewed", "transcribed", "trust the rules", "check level"],
  },
  {
    id: "city", question: "Is this a City of Seattle service?",
    answer: "No. It is a prototype made by the PermitOS team. It does not approve anything and its results are not a code decision. The city's plan reviewers decide; a licensed design professional can confirm before you apply.",
    words: ["city", "official", "approve", "government", "seattle service"],
  },
  {
    id: "plan-kept", question: "What happens to my floor plan?",
    answer: "The plan file is sent to the server, read, and deleted straight away. It is never stored. The facts read from it, your answers and the result are kept with your check so its page keeps working, until the date shown on the results page or until you delete the check.",
    words: ["saved", "kept", "stored", "privacy", "delete", "happens to my"],
  },
  {
    id: "not-sure", question: "What if I am not sure of an answer?",
    answer: "Choose Not sure. Any check that needs an answer or a plan value left as Not sure becomes Check with the city, unless the rest of the plan already shows something to fix, and a permit that depends on it is listed as May be needed.",
    words: ["not sure", "don't know", "dont know", "unsure", "unknown"],
  },
  {
    id: "cooking", question: "Why does it ask about cooking?",
    answer: "Cooking that makes grease or smoke brings in an exhaust hood, fire suppression, a mechanical permit and kitchen checks. Reheating, coffee and toasting usually do not. If you are not sure, choose Not sure and those items become things to check with the city.",
    words: ["cook", "grease", "fryer", "hood", "kitchen"],
  },
  {
    id: "zone", question: "Where do I find the zone?",
    answer: "Give the street address and the pre-check looks the zone up on the city's zoning map. If you already know the zone, for example from a listing or the city's online zoning map, you can type it instead. You can also leave both empty; the result then says zoning was not screened.",
    words: ["zone", "zoning", "address", "map"],
  },
  {
    id: "readable", question: "What makes a plan readable?",
    answer: "A clear drawing with every room labelled with its use and size, door widths and swings, which doors are exits, the restrooms and their fixtures, and the kitchen equipment if there is food. A PDF from the architect is best; a straight, sharp photo of a printed plan also works.",
    words: ["readable", "read", "photo", "scan", "pdf", "clear"],
  },
  {
    id: "unreadable", question: "What if the plan cannot be read?",
    answer: "You can upload a clearer copy, try one of the example plans, or enter the measurements yourself on the step that shows what was read. Entering them yourself always works, with or without the plan reader.",
    words: ["cannot", "can't", "failed", "error", "manual", "myself", "by hand"],
  },
  {
    id: "check-values", question: "Why should I check every value?",
    answer: "The plan reader can misread a dimension or miss a door. The check uses exactly the values on that page, so a wrong value gives a wrong result. Change anything that does not match your plan, and leave anything you cannot find as Not sure.",
    words: ["value", "wrong", "correct", "change", "misread"],
  },
  {
    id: "clear-width", question: "What is a door's clear width?",
    answer: "The open space a person passes through: from the face of the open door to the opposite door stop, not the width of the door leaf. Plans often print it next to the door, sometimes marked CLR.",
    words: ["clear width", "width", "door"],
  },
];

/** Suggested questions for each step (three or four). Before a result they are answered from HELP. */
export const SUGGESTIONS: Record<string, string[]> = {
  start: ["what", "city", "plan-kept"],
  business: ["cooking", "not-sure", "zone"],
  plan: ["readable", "plan-kept", "unreadable"],
  check: ["check-values", "not-sure", "clear-width"],
  help: ["what", "city", "not-sure"],
};

/** Suggested questions once a result exists; these are sent to the API, which answers from the result only. */
export const RESULT_SUGGESTIONS = [
  "What should I fix first?",
  "Why is the occupant load what it is?",
  "Which permits will I need?",
  "How long will plan review take?",
];

export const CAN_AND_CANNOT =
  "I explain this pre-check and your result. I do not approve permits or make code decisions: the city's plan reviewers do.";

export const BEFORE_RESULT =
  "Until your check has run I can only answer from how the pre-check works. These are the questions I can answer now:";

/** The help topic a typed question is about, by its words; null if none fits. */
export function matchHelp(question: string): HelpTopic | null {
  const q = question.toLowerCase();
  let best: { t: HelpTopic; score: number } | null = null;
  for (const t of HELP) {
    const score = t.words.filter((w) => q.includes(w)).reduce((n, w) => n + w.length, 0);
    if (score && (!best || score > best.score)) best = { t, score };
  }
  return best?.t ?? null;
}
