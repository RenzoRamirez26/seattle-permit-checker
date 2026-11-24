/**
 * The results page's tabs: which one is selected, kept per check in sessionStorage so a refresh keeps it,
 * and a way for a link to a finding (the assistant's "From your result") to open the finding's tab first.
 * In: the check id and the tab keys. Out: the stored keys, and a "reveal-finding" event the results page answers.
 */
export type TabMemory = { summary?: string; findings?: string };

const key = (checkId: string) => `precheck.tabs.${checkId}`;

export const resultsTabs = {
  read(checkId: string): TabMemory {
    try {
      const raw = window.sessionStorage.getItem(key(checkId));
      return raw ? (JSON.parse(raw) as TabMemory) : {};
    } catch {
      return {};
    }
  },
  write(checkId: string, memory: TabMemory) {
    try {
      window.sessionStorage.setItem(key(checkId), JSON.stringify(memory));
    } catch {
      /* storage blocked: the tabs still work, a refresh starts from the defaults */
    }
  },
};

export const REVEAL_FINDING = "precheck:reveal-finding";

/** Ask the results page to open the tab that holds finding <index>, then scroll to it and focus it. */
export function revealFinding(index: number) {
  window.dispatchEvent(new CustomEvent<number>(REVEAL_FINDING, { detail: index }));
}

/** The finding a "#finding-<index>" address points at, or null. */
export function findingInHash(hash: string): number | null {
  const m = hash.match(/^#finding-(\d+)$/);
  return m ? Number(m[1]) : null;
}
