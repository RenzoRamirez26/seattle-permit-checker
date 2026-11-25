import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { StartPage, type PlanPicture } from "./StartPage";
import { plexSerif } from "./fonts";

export const metadata: Metadata = pageMetadata({
  title: "Check your space before you sign the lease | PermitOS",
  absoluteTitle: true,
  description: "Upload a small-business floor plan, confirm what we read, and see what to fix and which Seattle permits to expect. A pre-check, not a city approval.",
  path: "/",
});

/** Start's drawing: café plan B as an SVG (public/demo-plan.svg, from python demo/make_plans.py --svg). A vector drawing
 * stays sharp at any width and is a fifth of the PNG's size once compressed. It is in the static HTML with its size,
 * so it needs no script to appear and the page does not move when it loads. */
const EXAMPLE_PLAN: PlanPicture = { src: "/demo-plan.svg", width: 628, height: 717 };

export default function Page() {
  return (
    <div className={plexSerif.variable}>
      <Suspense>
        <StartPage plan={EXAMPLE_PLAN} />
      </Suspense>
    </div>
  );
}
