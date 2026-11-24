import type { Metadata } from "next";
import "@fontsource/ibm-plex-serif/latin-400.css";
import { StartPage } from "./StartPage";

export const metadata: Metadata = { title: { absolute: "Check your floor plan before you apply | Seattle Permit Pre-Check" } };

export default function Page() {
  return <StartPage />;
}
