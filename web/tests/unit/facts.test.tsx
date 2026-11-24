import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { Facts, PlanReading } from "@/api/client";
import { GROUPS, NOT_A_ROW } from "@/content/facts";
import { formSchema, fromFormValues, toFormValues } from "@/components/plan/factForm";
import { FactsEditor } from "@/components/plan/FactGroup";
import { FactRow } from "@/components/plan/FactRow";
import { ErrorSummary } from "@/components/flow/ErrorSummary";
import { checkRequest } from "@/state/request";
import { emptyFacts, type Business } from "@/state/flow";
import { fixture } from "./fixtures";

const cafe = () => structuredClone(fixture<PlanReading>("reading_cafe_flawed").facts) as Facts;
const business: Business = {
  business_type: "cafe_restaurant", cooking_on_site: true, food_prep: null, serves_alcohol: false, outdoor_seating: null,
  upper_floor: false, historic_district: null, new_signage: null, address: "", zone: "NC2-55 (M)",
};

function Editor({ start, onFacts = () => {} }: { start: Facts; onFacts?: (f: Facts) => void }) {
  const [facts, setFacts] = useState(start);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <FactsEditor facts={facts} original={start} editing={editing} setEditing={setEditing}
      onChange={(f) => { setFacts(f); onFacts(f); }} onProblems={() => {}} />
  );
}

describe("every fact has a row and a label", () => {
  it("covers every field of Facts and of each thing on the plan, from the API's own reading", () => {
    const facts = cafe();
    const top = GROUPS.flatMap((g) => (g.kind === "top" ? g.fields.map((f) => f.key) : [g.key]));
    expect(new Set([...top, ...NOT_A_ROW])).toEqual(new Set(Object.keys(facts)));
    const check = (key: keyof Facts, sample: object | null | undefined) => {
      const g = GROUPS.find((x) => x.kind !== "top" && x.key === key)!;
      expect(new Set(g.fields.map((f) => f.key)), key).toEqual(new Set(Object.keys(sample!)));
      for (const f of g.fields) expect(f.label.length, `${key}.${f.key}`).toBeGreaterThan(2);
    };
    check("spaces", facts.spaces[0]);
    check("doors", facts.doors[0]);
    check("aisles", facts.aisles[0]);
    check("restrooms", facts.restrooms[0]);
    check("kitchen", facts.kitchen);
    check("fire_safety", facts.fire_safety);
  });

  it("renders a row with a Change button for every thing read from the café plan", () => {
    const facts = cafe();
    render(<Editor start={facts} />);
    const things = 1 + facts.spaces.length + facts.doors.length + facts.aisles.length + facts.restrooms.length + 1 + 1 + 1;
    expect(screen.getAllByRole("button", { name: /^Change / })).toHaveLength(things);
    expect(screen.getByRole("button", { name: "Change Door 1" })).toBeTruthy();
  });
});

describe("Not sure", () => {
  it("shows Not sure for a null fact and sends it back as null, never 0 or false", () => {
    const facts = cafe();
    expect(facts.accessible_seat_count).toBeNull();
    expect(facts.fire_safety!.emergency_lighting_noted).toBeNull();
    render(<Editor start={facts} />);
    const seats = screen.getByRole("listitem", { name: "Customer seating" });
    expect(within(seats).getByText("Not sure")).toBeTruthy();
    const body = checkRequest(facts, business);
    expect(body.facts.accessible_seat_count).toBeNull();
    expect(body.facts.fire_safety!.emergency_lighting_noted).toBeNull();
    expect(body.intake.food_prep).toBeNull();
    expect(body.intake.outdoor_seating).toBeNull();
    expect(body.zoning).toEqual({ address: null, zone: "NC2-55 (M)" });
  });

  it("turns an emptied number into null and a Not sure answer into null", () => {
    const g = GROUPS.find((x) => x.id === "doors")!;
    const values = { ...toFormValues(cafe().doors[0], g.fields), clear_width_in: "   " };
    const parsed = formSchema(g.fields).parse(values);
    expect(parsed.clear_width_in).toBeNull();
    const k = GROUPS.find((x) => x.id === "kitchen")!;
    expect(formSchema(k.fields).parse({ ...toFormValues(cafe().kitchen, k.fields), type1_hood_shown: "unsure" }).type1_hood_shown).toBeNull();
  });

  it("keeps a manual entry with every fact empty", () => {
    const body = checkRequest(emptyFacts(), business);
    expect(body.facts.doors).toEqual([]);
    expect(body.facts.gross_area_sqft).toBeNull();
    expect(body.facts.kitchen).toBeNull();
  });
});

describe("Change", () => {
  it("changes one value and keeps every other value of the thing and of the plan", async () => {
    const start = cafe();
    const seen = vi.fn();
    render(<Editor start={start} onFacts={seen} />);
    fireEvent.click(screen.getByRole("button", { name: "Change Door 1" }));
    const width = await screen.findByRole("textbox", { name: /Clear width/ });
    fireEvent.change(width, { target: { value: "38" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(seen).toHaveBeenCalled());
    const next: Facts = seen.mock.calls.at(-1)![0];
    expect(next.doors[0]).toEqual({ ...start.doors[0], clear_width_in: 38 });
    expect(next.doors.slice(1)).toEqual(start.doors.slice(1));
    expect({ ...next, doors: null }).toEqual({ ...start, doors: null });
    expect(await screen.findByText(/Changed by you/)).toBeTruthy();
  });

  it("fromFormValues keeps fields the form does not show", () => {
    const g = GROUPS.find((x) => x.id === "aisles")!;
    const out = fromFormValues({ label: "A", min_width_in: null }, g.fields, { label: "B", min_width_in: 1, extra: "kept" });
    expect(out).toEqual({ label: "A", min_width_in: null, extra: "kept" });
  });
});

describe("errors", () => {
  it("reports a field error, next to the field and as a problem that links to it", async () => {
    const problems = vi.fn();
    const g = GROUPS.find((x) => x.id === "doors")!;
    render(<FactRow rowId="fact-doors-0" title="Door 1" fields={g.fields} item={cafe().doors[0]} original={cafe().doors[0]}
      editing onEdit={() => {}} onCancel={() => {}} onSave={() => {}} onProblems={problems} />);
    fireEvent.change(await screen.findByRole("textbox", { name: /Clear width/ }), { target: { value: "wide" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(problems.mock.calls.some((c) => c[0].length === 1)).toBe(true));
    const [problem] = problems.mock.calls.find((c) => c[0].length === 1)![0];
    expect(problem).toEqual({ id: "fact-doors-0-clear_width_in", text: "Door 1: Enter the clear width as a number, or leave it empty if you are not sure." });
    expect(document.getElementById(problem.id)).toBeTruthy();
    expect(screen.getAllByText(/Enter the clear width as a number/).length).toBeGreaterThan(0);
  });

  it("lists each error in the summary as a link to its field", () => {
    render(<ErrorSummary items={[{ text: "Door 1: Enter the clear width as a number.", href: "#fact-doors-0-clear_width_in" },
      { text: "Restroom 1: Enter the toilets as a whole number.", href: "#fact-restrooms-0-water_closets" }]} />);
    const links = within(screen.getByRole("alert")).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#fact-doors-0-clear_width_in", "#fact-restrooms-0-water_closets"]);
  });
});
