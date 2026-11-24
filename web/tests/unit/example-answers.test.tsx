import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Meta } from "@/api/client";
import { flow, type Business } from "@/state/flow";
import { fixture } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const { ExampleAnswersNotice, exampleAnswerWords } = await import("@/components/flow/ExampleAnswersNotice");

const meta = fixture<Meta>("meta");
const CAFE: Business = { business_type: "cafe_restaurant", cooking_on_site: true, food_prep: false, serves_alcohol: false, outdoor_seating: false,
  upper_floor: false, historic_district: false, new_signage: null, address: "", zone: "NC2-55 (M)" };
const SALON: Business = { ...CAFE, business_type: "salon", cooking_on_site: false, zone: "NR3" };
const OWNER: Business = { ...CAFE, business_type: "retail", cooking_on_site: false, food_prep: null, address: "1420 5th Ave", zone: "" };

describe("an example plan's answers replacing the owner's (F2)", () => {
  it("keeps the owner's step 1 answers aside when an example replaces them", () => {
    flow.setBusiness(OWNER);
    flow.setExampleBusiness(CAFE);
    expect(flow.business()).toEqual(CAFE);
    expect(flow.replacedBusiness()).toEqual(OWNER);
  });

  it("keeps the owner's answers, not the first example's, when a second example is chosen", () => {
    flow.setBusiness(OWNER);
    flow.setExampleBusiness(CAFE);
    flow.setExampleBusiness(SALON);
    expect(flow.business()).toEqual(SALON);
    expect(flow.replacedBusiness()).toEqual(OWNER);
  });

  it("has nothing to keep when the owner gave no answers, or gave the example's own", () => {
    flow.setExampleBusiness(CAFE);
    expect(flow.replacedBusiness()).toBeNull();
    flow.setExampleBusiness(SALON);                        // the café's answers were an example's, not the owner's
    expect(flow.replacedBusiness()).toBeNull();
    flow.setBusiness(CAFE);
    flow.setExampleBusiness(CAFE);
    expect(flow.replacedBusiness()).toBeNull();
  });

  it("forgets the replaced answers once the owner answers step 1 again", () => {
    flow.setBusiness(OWNER);
    flow.setExampleBusiness(CAFE);
    flow.setBusiness({ ...OWNER, zone: "NC3-75" });
    expect(flow.replacedBusiness()).toBeNull();
  });

  it("names the example's answers in words", () => {
    expect(exampleAnswerWords(meta, CAFE)).toBe("Café or restaurant; cooking that makes grease or smoke: Yes; alcohol: No; zone NC2-55 (M)");
    expect(exampleAnswerWords(meta, SALON)).toBe("Salon, barbershop or spa; zone NR3");
  });

  it("shows the notice, and Keep my answers puts the owner's answers back and says so", async () => {
    flow.setBusiness(OWNER);
    flow.setExampleBusiness(CAFE);
    render(<ExampleAnswersNotice meta={meta} />);
    expect(screen.getByRole("heading", { name: "The example plan uses its own answers" })).toBeTruthy();
    expect(screen.getByText(/They replaced your answers from step 1: Café or restaurant; cooking that makes grease or smoke: Yes; alcohol: No; zone NC2-55 \(M\)\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See every answer on step 1" }).getAttribute("href")).toMatch(/^\/business\/?$/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep my answers" })));
    expect(flow.business()).toEqual(OWNER);
    expect(flow.replacedBusiness()).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Your answers from step 1 are kept. The check will use them with the example plan's measurements.");
    expect(screen.queryByRole("button", { name: "Keep my answers" })).toBeNull();
  });

  it("shows nothing when no answers were replaced", () => {
    flow.setExampleBusiness(CAFE);
    const { container } = render(<ExampleAnswersNotice meta={meta} />);
    expect(container.textContent).toBe("");
  });
});
