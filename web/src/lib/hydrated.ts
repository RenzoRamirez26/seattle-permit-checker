"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** false in the static HTML and the first render, true once in the browser: safe to read sessionStorage. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
