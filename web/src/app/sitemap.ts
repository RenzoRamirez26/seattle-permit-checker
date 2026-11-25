import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

/** The pages worth finding from a search. The pages in the middle of a check (reading, step 3, results) show one
 * tab's own answers, so they are left out and marked noindex. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/business/", "/plan/", "/help/", "/privacy/", "/terms/"].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
