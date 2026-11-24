/**
 * The assistant's state for this tab: open or closed, the conversation, and a question waiting to be typed.
 * In memory only. It never opens by itself: only the Ask button and "Ask about this" open it.
 */
export type Message =
  | { role: "user"; text: string; spoken?: boolean }
  | { role: "assistant"; text: string; cited: string[]; by: "template" | "model" | "help"; spoken?: boolean }
  | { role: "problem"; text: string };

type State = { open: boolean; messages: Message[]; draft: string; draftVersion: number; pending: boolean };

let state: State = { open: false, messages: [], draft: "", draftVersion: 0, pending: false };
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
  add: (m: Message) => set({ messages: [...state.messages, m] }),
  setPending: (pending: boolean) => set({ pending }),
  clear: () => set({ messages: [], draft: "", draftVersion: state.draftVersion + 1 }),
  /** For tests. */
  reset: () => set({ open: false, messages: [], draft: "", draftVersion: 0, pending: false }),
};
