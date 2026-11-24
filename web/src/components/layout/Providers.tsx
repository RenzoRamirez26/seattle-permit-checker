"use client";
/** Holds what every page shares: the API's /meta answer (business types, demo plans, limits, rulebook date). */
import { createContext, useContext, useEffect, useState } from "react";
import { api, call, type Meta } from "@/api/client";

type MetaState = { meta: Meta | null; problem: string | null };
const MetaContext = createContext<MetaState>({ meta: null, problem: null });

let pending: Promise<Meta> | null = null;
/** One /api/meta request per page load, shared by every component that asks. */
export function loadMeta(): Promise<Meta> {
  pending ??= call(() => api.GET("/api/meta")).catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MetaState>({ meta: null, problem: null });
  useEffect(() => {
    let live = true;
    loadMeta().then(
      (meta) => live && setState({ meta, problem: null }),
      (e) => live && setState({ meta: null, problem: e?.code ?? "network" }),
    );
    return () => {
      live = false;
    };
  }, []);
  return <MetaContext.Provider value={state}>{children}</MetaContext.Provider>;
}

export const useMeta = () => useContext(MetaContext);
