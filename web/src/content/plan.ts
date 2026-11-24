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
