import type { Metadata, Viewport } from "next";
import "@/styles/tokens.css";
import { plexMono, plexSans } from "./fonts";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Providers } from "@/components/layout/Providers";
import { Assistant } from "@/components/assistant/Assistant";
import { Suspense } from "react";
import { Analytics } from "@/components/layout/Analytics";
import { TURNSTILE_BOX } from "@/lib/turnstile";
import { OG_IMAGE, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PermitOS", template: "%s | PermitOS" },
  description: "Check a small-business floor plan against Seattle's building code before you apply. A prototype, not a City of Seattle service.",
  applicationName: "PermitOS",
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: "PermitOS", locale: "en_US", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <Providers>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="flex-1 pb-24 outline-none">
            {children}
          </main>
          <SiteFooter />
          <Suspense>
            <Assistant />
          </Suspense>
          {/* Cloudflare Turnstile draws here only when it needs the person to do something (src/lib/turnstile.ts). */}
          <div id={TURNSTILE_BOX} className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2" />
          <Suspense>
            <Analytics />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
