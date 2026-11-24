/** Fixed sentences for step 2 and the Reading page. Words only. */
export const USABLE_PLAN = [
  "Every room, with what it is used for and its size",
  "Every door, with its clear width and which way it opens, and which doors are exits",
  "Aisles and routes with their widths",
  "Restrooms with their fixtures, and the kitchen equipment and sinks if there is food",
  "Exit signs, fire extinguishers and sprinklers, if they are drawn or noted",
];
export const NOT_SAVED = (days: number) =>
  `Your plan file is not saved. It is read and deleted straight away. What was read from it is kept with your check for ${days} days, or until you delete the check.`;

/** The file chosen on step 2, before anything is sent. */
export const READY_TO_READ = "Ready to read. It is sent only when you press Read my plan.";

/** The example plans on step 2. */
export const EXAMPLES = {
  heading: "Try an example plan",
  text: "Invented plans, to see how the pre-check works without your own.",
  /** The link from the no-key notice and "Other ways to go on" down to the example rows. */
  below: "Try an example plan below",
};

/** When the model could not read an uploaded plan (?problem=plan_reading_failed). */
export const UNREADABLE = {
  heading: "We couldn't read this plan",
  suggestions: [
    "Upload a clearer scan or photo, taken straight on.",
    "Check that room sizes and door widths are written on the plan.",
  ],
  upload: "Upload another plan",
  byHand: "Enter the readings by hand",
};

/** The Checking state: the steps of the whole check, and what the page says while the plan is read. */
export const CHECKING_STEPS = ["Upload your plan", "Read the plan", "Confirm the readings", "Run the rules"] as const;
