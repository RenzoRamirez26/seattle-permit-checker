import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

/** Every page may be crawled; the API may not (it also serves its own robots.txt saying the same). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
