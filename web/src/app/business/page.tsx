import type { Metadata } from "next";
import { BusinessPage } from "./BusinessShell";

export const metadata: Metadata = { title: "What kind of business is it?" };

export default function Page() {
  return <BusinessPage />;
}
