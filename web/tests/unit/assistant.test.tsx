import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Check } from "@/api/client";
import { assistant } from "@/state/assistant";
import { fixture } from "./fixtures";

const nav = vi.hoisted(() => ({ path: "/business/", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useSearchParams: () => nav.params, useRouter: () => ({ push: vi.fn() }) }));
const { Assistant } = await import("@/components/assistant/Assistant");

const check = fixture<Check>("check_cafe_flawed");
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  assistant.reset();
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("the assistant", () => {
  it("never opens by itself, and opens from the Ask button with focus inside", async () => {
    nav.path = "/business/";
    render(<Assistant />);
    const panel = document.querySelector("section[role=dialog]")!;
    expect(panel.hasAttribute("data-open")).toBe(false);
    expect(panel.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(panel.hasAttribute("data-open")).toBe(true));
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it("before a result, answers from the fixed help text without any request", async () => {
    nav.path = "/business/";
    render(<Assistant />);
    act(() => assistant.open());
    fireEvent.click(await screen.findByRole("button", { name: "Why does it ask about cooking?" }));
    expect(await screen.findByText(/Cooking that makes grease or smoke brings in/)).toBeTruthy();
    expect(screen.getByText("From the pre-check's help text.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "How many exits do I need?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Until your check has run I can only answer/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("after a result, shows the answer as text (never HTML) and links a cited rule to every finding with it", async () => {
    nav.path = "/results/";
    nav.params = new URLSearchParams({ check: check.id });
    const planted = '<img src=x onerror="window.__owned=1"> Widen the doors.';
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.method === "GET") return json(check);
      return json({ text: planted, cited_rules: ["EG-3"], generated_by: "template", problems: [] });
    });
    render(<Assistant />);
    act(() => assistant.open());
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "Which doors are too narrow?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("log", { name: "Conversation" }).textContent).toContain("Answer: "));
    expect(await screen.findByText(planted)).toBeTruthy();                       // the characters, as text
    expect(document.querySelector("section[role=dialog] img")).toBeNull();
    expect((window as unknown as { __owned?: number }).__owned).toBeUndefined();
    const eg3 = check.result.findings.map((f, i) => [f.rule_id, i] as const).filter(([r]) => r === "EG-3").map(([, i]) => `#finding-${i}`);
    const links = within(screen.getByRole("log", { name: "Conversation" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href")!.replace(/^.*(?=#)/, ""))).toEqual(eg3);      // both EG-3 findings
    expect(screen.getByText("Written from your result by a template.")).toBeTruthy();
    const post = fetchMock.mock.calls.map((c) => c[0] as Request).find((r) => r.method === "POST")!;
    expect(post.url).toBe(`http://api.test/api/checks/${check.id}/ask`);
    expect(await post.clone().json()).toEqual({ question: "Which doors are too narrow?", history: [] });
  });

  it("puts an Ask about this question in the box without sending it", async () => {
    nav.path = "/results/";
    nav.params = new URLSearchParams({ check: check.id });
    fetchMock.mockImplementation(async () => json(check));
    render(<Assistant />);
    act(() => assistant.askAbout("Tell me more about “Not enough exits”."));
    const box = await screen.findByRole("textbox", { name: "Your question" });
    expect((box as HTMLTextAreaElement).value).toBe("Tell me more about “Not enough exits”.");
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(fetchMock.mock.calls.filter((c) => (c[0] as Request).method === "POST")).toHaveLength(0);
  });
});
