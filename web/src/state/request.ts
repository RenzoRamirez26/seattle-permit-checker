/**
 * The body of POST /api/checks, from what the owner entered. Every answer is sent, and "Not sure" is sent
 * as null, never false (Q1), so the API can treat it as unknown. Facts are sent as the owner confirmed them.
 */
import type { Facts, Schemas } from "@/api/client";
import type { Business } from "./flow";

export function checkRequest(facts: Facts, b: Business): Schemas["CheckRequest"] {
  const address = b.address?.trim() || null;
  const zone = b.zone?.trim() || null;
  return {
    facts,
    intake: {
      business_type: b.business_type,
      cooking_on_site: b.cooking_on_site,
      food_prep: b.food_prep,
      serves_alcohol: b.serves_alcohol,
      outdoor_seating: b.outdoor_seating,
      upper_floor: b.upper_floor,
      historic_district: b.historic_district,
      new_signage: b.new_signage,
    } as Schemas["Intake"],
    zoning: address ? { address, zone: null } : zone ? { address: null, zone } : {},
  };
}
