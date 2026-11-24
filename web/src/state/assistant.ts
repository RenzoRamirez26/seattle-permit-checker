/**
 * The assistant's state for this tab: open or closed, the conversation, a question waiting to be typed, and the
 * words last heard by voice input (the "We heard" line).
 * In memory only. It never opens by itself: only the Ask button and "Ask about this" open it.
 */
export type Message =
  | { role: "user"; text: string; spoken?: boolean }
  | { role: "assistant"; text: string; cited: string[]; by: "template" | "model" | "help"; spoken?: boolean }
  | { role: "problem"; text: string };

/** heard: the words voice input put in the box; spoken: the box's text still came from the microphone. */
type Heard = { heard: string; spoken: boolean };
type State = { open: boolean; messages: Message[]; draft: string; draftVersion: number; pending: boolean } & Heard;

const EMPTY: State = { open: false, messages: [], draft: "", draftVersion: 0, pending: false, heard: "", spoken: false };
let state: State = EMPTY;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const assistant = {
  get: () => state,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  open: () => set({ open: true }),
  close: () => set({ open: false }),
  /** "Ask about this": open with a question in the box, not sent. */
  askAbout: (text: string) => set({ open: true, draft: text, draftVersion: state.draftVersion + 1 }),
  /** Keeps what is in the box when the panel changes between side panel and sheet (rotating a tablet). */
  keepDraft: (text: string) => {
    state = { ...state, draft: text };
  },
  /**
   * The "We heard" line. Kept here, not in the panel, because the side panel and the sheet are different elements:
   * when one replaces the other (the window narrows, a phone rotates) the line must stay with the words in the box.
   */
  setHeard: (h: Partial<Heard>) => set(h),
  add: (m: Message) => set({ messages: [...state.messages, m] }),
  setPending: (pending: boolean) => set({ pending }),
  clear: () => set({ messages: [], draft: "", draftVersion: state.draftVersion + 1, heard: "", spoken: false }),
  /** For tests. */
  reset: () => set(EMPTY),
};
