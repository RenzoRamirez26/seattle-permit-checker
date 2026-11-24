import type { Page } from "@playwright/test";
import { fixture } from "./helpers";

export const CAFE_BUSINESS = {
  business_type: "cafe_restaurant", cooking_on_site: true, food_prep: false, serves_alcohol: false, outdoor_seating: false,
  upper_floor: false, historic_district: false, new_signage: null, address: "", zone: "NC2-55 (M)",
};
export const SALON_BUSINESS = { ...CAFE_BUSINESS, business_type: "salon", cooking_on_site: false, zone: "NR3" };

/** Puts a reading and the business answers in sessionStorage once, as steps 1 and 2 would. A refresh keeps later edits. */
export async function seed(page: Page, opts: { caseId?: string; reading?: object; business?: object | null }) {
  const reading = opts.reading ?? fixture(`reading_${opts.caseId}`);
  const business = opts.business === undefined ? CAFE_BUSINESS : opts.business;
  await page.addInitScript(([r, b]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    sessionStorage.setItem("precheck.reading", JSON.stringify(r));
    sessionStorage.setItem("precheck.facts", JSON.stringify((r as { facts: unknown }).facts));
    if (b) sessionStorage.setItem("precheck.business", JSON.stringify(b));
  }, [reading, business] as const);
}
