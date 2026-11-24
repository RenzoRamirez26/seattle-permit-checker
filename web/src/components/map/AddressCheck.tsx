"use client";
/**
 * Step 1: once an address is entered, POST /api/zoning finds it and shows the pin with "Is this the right place?",
 * so a wrong address is obvious before the check runs. The words are always written out; the map is extra.
 */
import { useEffect, useState } from "react";
import { api, ApiProblem, call, type ZoningResponse } from "@/api/client";
import { errorWords } from "@/api/errors";
import { LazyPlaceMap } from "./LazyPlaceMap";

type State = { status: "idle" } | { status: "looking" } | { status: "done"; z: ZoningResponse } | { status: "problem"; code: string };

export function AddressCheck({ address, businessType }: { address: string; businessType: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [asked, setAsked] = useState("");
  const key = `${address.trim()}|${businessType}`;

  if (address.trim() && businessType && key !== asked) {
    setAsked(key);
    setState({ status: "looking" });
  }

  useEffect(() => {
    const [a, b] = asked.split("|");
    if (!a || !b) return;
    let live = true;
    call(() => api.POST("/api/zoning", { body: { address: a, business_type: b } })).then(
      (z) => live && setState({ status: "done", z }),
      (e) => live && setState({ status: "problem", code: e instanceof ApiProblem ? e.code : "network" }),
    );
    return () => {
      live = false;
    };
  }, [asked]);

  if (!address.trim() || state.status === "idle") return null;
  return (
    <section aria-labelledby="place-heading" aria-live="polite" className="flex flex-col gap-2 border-l-2 border-hairline pl-4">
      <h2 id="place-heading" className="m-0 text-body font-semibold">Is this the right place?</h2>
      {state.status === "looking" ? <p className="m-0 text-ink-muted">Finding the address on the map…</p> : null}
      {state.status === "problem" ? <p className="m-0">{errorWords(state.code)} The address is still used in the check.</p> : null}
      {state.status === "done" ? (
        state.z.point ? (
          <>
            <p className="m-0 break-words">
              Found: {typeof state.z.zoning.address === "string" ? state.z.zoning.address : address.trim()}.{" "}
              {state.z.zoning.district ? <>Zone <span className="font-mono font-semibold" translate="no">{state.z.zoning.district}</span>.</> : null}
            </p>
            <LazyPlaceMap point={state.z.point} label={`Map with a pin at ${address.trim()}`} />
            <p className="m-0 text-small text-ink-muted">If the pin is in the wrong place, correct the address above, or enter the zone instead.</p>
          </>
        ) : (
          <p className="m-0">This address was not found on Seattle&rsquo;s map. Check it, for example 1420 5th Ave, or enter the zone instead.</p>
        )
      ) : null}
    </section>
  );
}
