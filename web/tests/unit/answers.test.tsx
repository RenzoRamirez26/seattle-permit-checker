/**
 * The Answers page (step 3) groups: "Check these first" (readings the API left empty), "Also used in the check",
 * "About your business"; the caption over the plan; the pill choices. No network: fixtures only.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { Facts, Meta, PlanReading } from "@/api/client";
import { AboutBusiness } from "@/app/check/CheckPage";
import { RadioGroup } from "@/components/ui/radio-group";
import { FactsEditor, type SelectedRow } from "@/components/plan/FactGroup";
import { leftEmpty } from "@/components/plan/FactRow";
import { selectedWords } from "@/components/plan/PlanViewer";
import { ANSWERS, GROUPS, readByRules } from "@/content/facts";
import { emptyFacts, type Business } from "@/state/flow";
import { fixture } from "./fixtures";

const cafe = () => structuredClone(fixture<PlanReading>("reading_cafe_flawed").facts) as Facts;
const meta = fixture<Meta>("meta");
const business: Business = {
  business_type: "cafe_restaurant", cooking_on_site: true, food_prep: null, serves_alcohol: false, outdoor_seating: null,
  upper_floor: false, historic_district: null, new_signage: null, address: "", zone: "NC2-55 (M)",
};

function Editor({ start, original = start, onSelect }: { start: Facts; original?: Facts | null; onSelect?: (r: SelectedRow | null) => void }) {
  const [facts, setFacts] = useState(start);
  const [editing, setEditing] = useState<string | null>(null);
  return <FactsEditor facts={facts} original={original} editing={editing} setEditing={setEditing} onChange={setFacts} onProblems={() => {}} onSelect={onSelect} />;
}

const group = (name: string) => screen.getByRole("region", { name });
const rowTitles = (el: HTMLElement) => within(el).queryAllByRole("listitem").filter((li) => li.id).map((li) => li.getAttribute("id"));

describe("Check these first", () => {
  it("holds exactly the rows the reading left empty, with the line and the hollow ? mark under each empty reading", () => {
    const facts = cafe();
    render(<Editor start={facts} />);
    const first = group("Check these first");
    expect(rowTitles(first)).toEqual([
      "fact-rooms-4", "fact-rooms-5", "fact-rooms-6",           // restroom rooms and the corridor: no area printed
      "fact-doors-1", "fact-doors-2",                             // restroom doors: which way they open is "unknown"
      "fact-kitchen", "fact-fire", "fact-seats",                  // grease interceptor, emergency lighting, accessible seats
    ]);
    for (const li of within(first).getAllByRole("listitem").filter((l) => l.id)) {
      // one line per reading left empty, never on the row's title
      const empty = within(li).getAllByText("Not sure");
      const lines = within(li).getAllByText(ANSWERS.emptyLine);
      expect(empty.length).toBeGreaterThan(0);
      expect(lines).toHaveLength(empty.length);
      expect(li.querySelectorAll('svg[data-mark="city"]')).toHaveLength(empty.length);
      const title = li.querySelector("h3, h4")!;
      expect(title.nextElementSibling?.textContent).not.toBe(ANSWERS.emptyLine);
      for (const line of lines) expect(line.closest("dd") ?? line.previousElementSibling?.textContent?.startsWith(ANSWERS.where)).toBeTruthy();
    }
    expect(within(first).getByText("Restroom room dimensions are not printed.")).toBeTruthy();
    // The other rows are under "Also used in the check", each with Change, and none says it is unsure.
    const also = group(ANSWERS.alsoUsed);
    expect(within(also).queryByText(ANSWERS.emptyLine)).toBeNull();
    expect(within(also).getByRole("button", { name: "Change Door 1" })).toBeTruthy();
    expect(within(also).getByRole("button", { name: "Change The whole space" })).toBeTruthy();
  });

  it("comes before Also used in the check", () => {
    render(<Editor start={cafe()} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf(ANSWERS.checkFirst)).toBeLessThan(headings.indexOf(ANSWERS.alsoUsed));
  });

  it("matches leftEmpty for every row, so the group follows the API's own empty values", () => {
    const facts = cafe();
    const g = GROUPS.find((x) => x.id === "doors")!;
    expect(facts.doors.map((d) => leftEmpty(g.fields, d))).toEqual([false, true, true]);
    const seats = GROUPS.find((x) => x.id === "seats")!;
    expect(leftEmpty(seats.fields, facts as never)).toBe(true);
  });

  it("is left out, heading and all, when nothing was left empty and the reader noted nothing", () => {
    const facts = cafe();
    facts.uncertainties = [];
    facts.accessible_seat_count = 4;
    facts.kitchen!.grease_interceptor_shown = true;
    facts.fire_safety!.emergency_lighting_noted = true;
    facts.doors = facts.doors.map((d) => ({ ...d, swing: "outward" }));
    facts.spaces = facts.spaces.map((s) => ({ ...s, area_sqft: 1, width_ft: 1, length_ft: 1 }));
    render(<Editor start={facts} />);
    expect(screen.queryByRole("heading", { name: ANSWERS.checkFirst })).toBeNull();
    expect(screen.getByRole("heading", { name: ANSWERS.usedAll })).toBeTruthy();
  });

  it("is left out for manual entry, where nothing was read", () => {
    render(<Editor start={emptyFacts()} original={null} />);
    expect(screen.queryByRole("heading", { name: ANSWERS.checkFirst })).toBeNull();
    expect(screen.getAllByText(ANSWERS.noneEntered)).toHaveLength(4);
  });

  it("opens the row's form in one step, and after a change says Changed by you instead, without moving the row", async () => {
    render(<Editor start={cafe()} />);
    fireEvent.click(screen.getByRole("button", { name: "Change Customer seating" }));
    const seats = await screen.findByRole("textbox", { name: /Seats at accessible tables/ });
    fireEvent.change(seats, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const row = await screen.findByRole("listitem", { name: "Customer seating" });
    await waitFor(() => expect(within(row).getByText(ANSWERS.changed)).toBeTruthy());
    expect(within(row).queryByText(ANSWERS.emptyLine)).toBeNull();
    expect(group(ANSWERS.checkFirst).contains(row)).toBe(true);
  });

  it("does not put a row the owner added in Check these first", async () => {
    render(<Editor start={cafe()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a door" }));
    const form = await screen.findByRole("form", { name: "Change New door" });
    expect(group(ANSWERS.alsoUsed).contains(form)).toBe(true);
  });
});

describe("the caption over the plan", () => {
  it("names the row being changed and where it is, in words", async () => {
    const seen = vi.fn();
    render(<Editor start={cafe()} onSelect={seen} />);
    fireEvent.click(screen.getByRole("button", { name: "Change Restroom 1 door" }));
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith({ id: "fact-doors-1", title: "Restroom 1 door", where: "off corridor" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.focus(screen.getByRole("button", { name: "Change Kitchen and food preparation" }));
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith({ id: "fact-kitchen", title: "Kitchen and food preparation", where: null }));
  });

  it("says when the plan reading gave no place", () => {
    expect(selectedWords({ title: "Door 1", where: "main entry, south wall" })).toBe("Selected: Door 1. Where: main entry, south wall.");
    expect(selectedWords({ title: "Kitchen and food preparation", where: null })).toBe("Selected: Kitchen and food preparation. Where: not marked on the plan.");
  });
});

describe("About your business", () => {
  it("shows the step 1 answers as rows, with one Change link to step 1", () => {
    render(<AboutBusiness business={business} meta={meta} />);
    const rows = within(screen.getByTestId("business-answers")).getAllByRole("definition").map((dd) => dd.previousElementSibling?.textContent + ": " + dd.textContent);
    expect(rows[0]).toBe("Kind of business: Café or restaurant");
    expect(rows).toContain("Will there be cooking that makes grease or smoke?: Yes");
    expect(rows).toContain("Will you serve alcohol?: No");
    expect(rows).toContain("Will there be tables or chairs outside, on the sidewalk or a patio?: Not sure");
    expect(rows.at(-1)).toBe("Zone: NC2-55 (M)");
    const link = screen.getByRole("link", { name: ANSWERS.changeLabel });
    expect(link.getAttribute("href")).toMatch(/^\/business\/?$/);
    expect(link.textContent).toBe("Change");
  });

  it("says so when there are no answers, with the link", () => {
    render(<AboutBusiness business={null} meta={meta} />);
    expect(screen.getByText(ANSWERS.noBusiness)).toBeTruthy();
    expect(screen.getByRole("link", { name: ANSWERS.answerThem }).getAttribute("href")).toMatch(/^\/business\/?$/);
  });
});

describe("pill choices", () => {
  it("marks the chosen pill, Not sure included, with the tint and the blue edge", () => {
    render(<RadioGroup label="Exit signs" orientation="horizontal" value="unsure" onChange={() => {}}
      choices={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" }]} />);
    const pill = screen.getByRole("radio", { name: "Not sure" }).closest("label")!;
    expect(pill.className).toMatch(/\brounded-full\b/);
    expect(pill.className).toMatch(/\bbg-tint\b/);
    expect(pill.className).toMatch(/\btext-blue\b/);
    expect(pill.className).toMatch(/\bborder-blue\b/);
    expect(pill.hasAttribute("data-selected")).toBe(true);
    const other = screen.getByRole("radio", { name: "Yes" }).closest("label")!;
    expect(other.className).toMatch(/\bbg-white\b/);
    expect(other.className).toMatch(/\bborder-field\b/);
  });
});

describe("values no rule reads (#24)", () => {
  const meta = fixture<Meta>("meta");
  const kitchen = GROUPS.find((g) => g.id === "kitchen")!;
  const rooms = GROUPS.find((g) => g.id === "rooms")!;
  const field = (g: typeof kitchen, key: string) => g.fields.find((f) => f.key === key)!;
  it("follows /api/meta: the grease interceptor and a restroom's area are not read; the hood and a dining room's area are", () => {
    expect(readByRules(meta, kitchen, field(kitchen, "grease_interceptor_shown"), {})).toBe(false);
    expect(readByRules(meta, kitchen, field(kitchen, "type1_hood_shown"), {})).toBe(true);
    expect(readByRules(meta, rooms, field(rooms, "area_sqft"), { use: "restroom" })).toBe(false);
    expect(readByRules(meta, rooms, field(rooms, "area_sqft"), { use: "dining" })).toBe(true);
    expect(readByRules(null, kitchen, field(kitchen, "grease_interceptor_shown"), {})).toBe(true);   // before meta loads
  });
});
