/**
 * Page metadata: title, description, the canonical URL and the social preview, the same way on every page.
 * The site's address comes from NEXT_PUBLIC_SITE_URL at build time (https://your-domain); without it, localhost.
 * In: a page's title, description and path.  Out: a Next.js Metadata object.
 */
import type { Metadata } from "next";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
export const SITE_NAME = "PermitOS";
export const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "PermitOS: check your space before you sign the lease." };

export function pageMetadata({ title, description, path, absoluteTitle = false, index = true }: {
  title: string;
  description: string;
  path: string;
  /** The title as given, without " | PermitOS" (Start). */
  absoluteTitle?: boolean;
  /** false for pages that only make sense in the middle of a check (they show this tab's own answers). */
  index?: boolean;
}): Metadata {
  const full = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", url: path, title: full, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE.url] },
  };
}
