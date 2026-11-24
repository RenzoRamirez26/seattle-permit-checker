import { describe, expect, it } from "vitest";
import type { Meta } from "@/api/client";
import { questionsFor, toBusiness } from "@/app/business/BusinessPage";
import { fileProblem } from "@/app/plan/PlanPage";
import { checkRequest } from "@/state/request";
import { emptyFacts } from "@/state/flow";
import { fixture } from "./fixtures";

const meta = fixture<Meta>("meta");
const base = { address: "", zone: "", cooking_on_site: "", serves_alcohol: "", food_prep: "", outdoor_seating: "",
  upper_floor: "", historic_district: "", new_signage: "" } as const;

describe("step 1 answers", () => {
  it("asks cooking for food businesses and alcohol for food and bar types, from the API's business types", () => {
    for (const t of meta.business_types) {
      const { required } = questionsFor(meta, t.key);
      expect(required.includes("cooking_on_site"), t.key).toBe(t.serves_food);
      expect(required.includes("serves_alcohol"), t.key).toBe(t.serves_food || t.serves_alcohol);
    }
  });

  it("sends Not sure as null, never false", () => {
    const b = toBusiness({ ...base, business_type: "cafe_restaurant", cooking_on_site: "unsure", serves_alcohol: "unsure", upper_floor: "unsure" }, meta);
    expect(b.cooking_on_site).toBeNull();
    expect(b.serves_alcohol).toBeNull();
    expect(b.upper_floor).toBeNull();
    const body = checkRequest(emptyFacts(), b);
    expect(body.intake.cooking_on_site).toBeNull();
    expect(body.intake.serves_alcohol).toBeNull();
    expect(JSON.stringify(body.intake)).toContain('"cooking_on_site":null');
  });

  it("sends an unanswered optional question as null, and Yes and No as true and false", () => {
    const b = toBusiness({ ...base, business_type: "cafe_restaurant", cooking_on_site: "yes", serves_alcohol: "no", outdoor_seating: "yes" }, meta);
    expect([b.cooking_on_site, b.serves_alcohol, b.outdoor_seating]).toEqual([true, false, true]);
    expect([b.upper_floor, b.historic_district, b.new_signage]).toEqual([null, null, null]);
  });

  it("sends a question the business type does not ask as false (a salon is not asked about cooking)", () => {
    const b = toBusiness({ ...base, business_type: "salon" }, meta);
    expect(b.cooking_on_site).toBe(false);
    expect(b.serves_alcohol).toBe(false);
    expect(b.food_prep).toBeNull();                    // optional for a salon, unanswered
  });

  it("sends the address or the zone, trimmed", () => {
    const b = toBusiness({ ...base, business_type: "retail", address: "  1420 5th Ave  " }, meta);
    expect(checkRequest(emptyFacts(), b).zoning).toEqual({ address: "1420 5th Ave", zone: null });
  });
});

describe("step 2 file check, before anything is sent", () => {
  const file = (name: string, mb: number) => {
    const f = new File([new Uint8Array(8)], name);
    Object.defineProperty(f, "size", { value: Math.round(mb * 1024 * 1024) });
    return f;
  };

  it("refuses a 12 MB file using the API's own limit", () => {
    expect(meta.limits.max_upload_mb).toBe(10);
    const p = fileProblem(file("plan.pdf", 12), meta);
    expect(p).toMatch(/^The file is 12 MB and the limit is 10 MB\./);
    expect(fileProblem(file("plan.pdf", 9.9), meta)).toBeNull();
  });

  it("refuses a type the API does not accept, in the brief's words", () => {
    expect(fileProblem(file("plan.gif", 1), meta)).toBe("The file must be a PDF, PNG or JPG.");
    expect(fileProblem(file("PLAN.JPEG", 1), meta)).toBeNull();
    expect(fileProblem(file("plan.png", 0), meta)).toMatch(/The file is empty/);
  });
});
