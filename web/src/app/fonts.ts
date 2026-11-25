/**
 * The site's fonts (DESIGN.md, Type): IBM Plex Sans 300/400/500 and Plex Mono 400 on every page, Plex Serif 400 for
 * Start's headline only. Self-hosted from the @fontsource packages through next/font, which preloads the ones the first
 * screen needs and gives each a fallback with the same metrics, so text does not jump when the font arrives.
 * The tokens (src/styles/tokens.css) name them through the CSS variables below.
 */
import localFont from "next/font/local";


export const plexSans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const plexMono = localFont({
  src: [{ path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,               // code sections and measurements, below the first screen
  adjustFontFallback: false,
});

export const plexSerif = localFont({
  src: [{ path: "../../node_modules/@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-plex-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
