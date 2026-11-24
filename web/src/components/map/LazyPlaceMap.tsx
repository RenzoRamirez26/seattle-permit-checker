"use client";
/** PlaceMap, loaded only on the pages that show a map, and only in the browser. */
import dynamic from "next/dynamic";

export const LazyPlaceMap = dynamic(() => import("./PlaceMap").then((m) => m.PlaceMap), {
  ssr: false,
  loading: () => <div className="aspect-[4/3] w-full rounded-2xl border border-hairline" aria-hidden />,
});
