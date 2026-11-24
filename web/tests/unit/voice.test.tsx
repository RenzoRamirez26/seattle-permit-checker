import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Check, Meta } from "@/api/client";
import { assistant } from "@/state/assistant";
import { encodeWav, WAV_RATE } from "@/voice/wav";
import { fixture } from "./fixtures";

const nav = vi.hoisted(() => ({ path: "/results/", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useSearchParams: () => nav.params, useRouter: () => ({ push: vi.fn() }) }));
const meta = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/components/layout/Providers", () => ({ useMeta: () => ({ meta: meta.value, problem: null }), loadMeta: async () => meta.value }));
const recorder = vi.hoisted(() => ({ can: true, wav: new Blob() }));
vi.mock("@/voice/recorder", () => ({
  canRecord: () => recorder.can,
  startRecording: async () => ({ stop: async () => recorder.wav, cancel: () => {} }),
}));
const { Assistant } = await import("@/components/assistant/Assistant");

const check = fixture<Check>("check_cafe_flawed");
const baseMeta = fixture<Meta>("meta");
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;
let spoken: string[];

beforeEach(() => {
  assistant.reset();
  localStorage.clear();
  meta.value = { ...baseMeta, features: { ...baseMeta.features, speech_to_text: true } };
  recorder.can = true;
  recorder.wav = new Blob([encodeWav(new Float32Array(1600)) as BlobPart], { type: "audio/wav" });
  nav.path = "/results/";
  nav.params = new URLSearchParams({ check: check.id });
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
  spoken = [];
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} onend?: () => void; onerror?: () => void; lang = ""; });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: (u: { text: string }) => spoken.push(u.text), cancel: () => {} } });
  fetchMock = vi.fn(async (req: Request) => {
    if (req.url.endsWith("/api/transcribe")) return json(fixture("transcribe"));
    if (req.method === "POST") return json({ text: "Because the occupant load is over the limit for one exit.", cited_rules: ["EG-1"], generated_by: "template", problems: [] });
    return json(check);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("the WAV encoder", () => {
  it("writes a 16 kHz mono 16-bit header and the right length", () => {
    const n = 4000;
    const wav = encodeWav(new Float32Array(n).fill(0.5));
    const v = new DataView(wav.buffer);
    const text = (at: number, len: number) => String.fromCharCode(...wav.slice(at, at + len));
    expect([text(0, 4), text(8, 4), text(12, 4), text(36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint16(20, true)).toBe(1);              // PCM
    expect(v.getUint16(22, true)).toBe(1);              // mono
    expect(v.getUint32(24, true)).toBe(WAV_RATE);
    expect(WAV_RATE).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(n * 2);
    expect(v.getUint32(4, true)).toBe(36 + n * 2);
    expect(wav.length).toBe(44 + n * 2);
    expect(v.getInt16(44, true)).toBe(16383);           // 0.5 of full scale, as a 16-bit sample
  });
});

describe("the microphone", () => {
  const openPanel = () => act(() => assistant.open());

  it("is shown only when the server has speech to text, Voice is on and the browser can record", () => {
    const { unmount } = render(<Assistant />);
    openPanel();
    expect(screen.getByRole("button", { name: "Speak" })).toBeTruthy();
    unmount();

    meta.value = { ...baseMeta, features: { ...baseMeta.features, speech_to_text: false } };
    const a = render(<Assistant />);
    expect(screen.queryByRole("button", { name: "Speak" })).toBeNull();
    a.unmount();

    meta.value = { ...baseMeta, features: { ...baseMeta.features, speech_to_text: true } };
    recorder.can = false;
    const b = render(<Assistant />);
    expect(screen.queryByRole("button", { name: "Speak" })).toBeNull();
    b.unmount();

    recorder.can = true;
    localStorage.setItem("precheck.voice", "off");
    render(<Assistant />);
    expect(screen.queryByRole("button", { name: "Speak" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: /Voice/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("puts the heard words in the box and sends nothing until Send; the answer is read aloud as plain text", async () => {
    render(<Assistant />);
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Speak" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    const box = screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe("Why do I need a second exit for my cafe?"));
    const transcribe = fetchMock.mock.calls.map((c) => c[0] as Request).find((r) => r.url.endsWith("/api/transcribe"))!;
    expect(transcribe.url).toBe("http://api.test/api/transcribe");
    const form = await transcribe.clone().formData();
    const audio = form.get("audio") as File;
    expect(audio.type).toBe("audio/wav");
    expect(String.fromCharCode(...new Uint8Array(await audio.arrayBuffer()).slice(0, 4))).toBe("RIFF");
    expect(fetchMock.mock.calls.filter((c) => (c[0] as Request).url.endsWith("/ask"))).toHaveLength(0);   // not sent

    fireEvent.change(box, { target: { value: "Why do I need a second exit for my café?" } });             // corrected
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(spoken).toEqual(["Because the occupant load is over the limit for one exit."]));
    const ask = fetchMock.mock.calls.map((c) => c[0] as Request).find((r) => r.url.endsWith("/ask"))!;
    expect((await ask.clone().json()).question).toBe("Why do I need a second exit for my café?");
    expect(screen.getByRole("button", { name: "Stop reading" })).toBeTruthy();
  });

  it("does not read aloud a typed question's answer, and never with Voice off", async () => {
    render(<Assistant />);
    openPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "What should I fix first?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/over the limit for one exit/);
    expect(spoken).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));                                    // only when asked
    expect(spoken).toEqual(["Because the occupant load is over the limit for one exit."]);

    fireEvent.click(screen.getByRole("checkbox", { name: /Voice/ }));
    expect(localStorage.getItem("precheck.voice")).toBe("off");
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Speak" })).toBeNull();
  });
});
