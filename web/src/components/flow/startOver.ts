/**
 * "Start over" from the header: clears what this tab kept (flow.clear()) and counts each time, so a page that already
 * holds the old answers in memory (Start's form) can start again empty by using the count as its key.
 * In: a press of Start over.  Out: a number that goes up by one each time.
 */
import { flow } from "@/state/flow";

let count = 0;
const listeners = new Set<() => void>();

export const startOver = {
  get: () => count,
  run: () => {
    flow.clear();
    count += 1;
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
