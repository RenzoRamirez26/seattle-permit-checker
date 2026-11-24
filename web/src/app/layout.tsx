import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/latin-300.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@/styles/tokens.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Providers } from "@/components/layout/Providers";
import { Assistant } from "@/components/assistant/Assistant";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: { default: "PermitOS", template: "%s | PermitOS" },
  description: "Check a small-business floor plan against Seattle's building code before you apply. A prototype, not a City of Seattle service.",
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
        </Providers>
      </body>
    </html>
  );
}
