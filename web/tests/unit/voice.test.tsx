/**
 * Voice input, with the browser's APIs mocked: Path A (on-device SpeechRecognition with processLocally), Path B
 * (MediaRecorder, sent to our API with its real type), Path C (no voice), and a blocked microphone. No audio may ever
 * reach SpeechRecognition unless it can process locally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Check, Meta } from "@/api/client";
import { assistant } from "@/state/assistant";
import { RECORD_TYPES, recordType } from "@/voice/recorder";
import { fixture } from "./fixtures";

const nav = vi.hoisted(() => ({ path: "/results/", params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useSearchParams: () => nav.params, useRouter: () => ({ push: vi.fn() }) }));
const meta = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/components/layout/Providers", () => ({ useMeta: () => ({ meta: meta.value, problem: null }), loadMeta: async () => meta.value }));
const { Assistant } = await import("@/components/assistant/Assistant");

const check = fixture<Check>("check_cafe_flawed");
const baseMeta = fixture<Meta>("meta");
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const HEARD = "Why do I need a second exit for my cafe?";
let fetchMock: ReturnType<typeof vi.fn>;
let spoken: string[];

// ---------------------------------------------------------------- a fake on-device SpeechRecognition
type Res = { transcript: string; isFinal: boolean };
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static available = vi.fn(async () => "available");
  static install = vi.fn(async () => true);
  local = false;
  lang = ""; interimResults = false; continuous = false; maxAlternatives = 0;
  started = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.onend?.(); }
  abort() {}
  say(results: Res[]) {
    this.onresult?.({ results: results.map((r) => Object.assign([{ transcript: r.transcript }], { isFinal: r.isFinal })) });
  }
}
// As in a browser with on-device recognition: processLocally is an accessor on the prototype.
Object.defineProperty(FakeRecognition.prototype, "processLocally", {
  get(this: FakeRecognition) { return this.local; },
  set(this: FakeRecognition, v: boolean) { this.local = v; },
});
/** The same class as browsers without on-device recognition expose it: no processLocally. */
class CloudOnlyRecognition {
  static constructed = 0;
  static available = vi.fn();
  constructor() { CloudOnlyRecognition.constructed++; }
  start() {}
}
delete (CloudOnlyRecognition.prototype as { processLocally?: boolean }).processLocally;

// ---------------------------------------------------------------- a fake MediaRecorder and microphone
const mic = { allow: true, requests: 0 };
class FakeMediaRecorder {
  static types: string[] = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported = (t: string) => FakeMediaRecorder.types.includes(t);
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown, public options: { mimeType: string }) { FakeMediaRecorder.last = this; }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type: this.options.mimeType }) });
    this.onstop?.();
  }
}

function useRecognition(C: unknown) {
  vi.stubGlobal("SpeechRecognition", C);
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = C;
}

beforeEach(() => {
  assistant.reset();
  localStorage.clear();
  meta.value = { ...baseMeta, features: { ...baseMeta.features, speech_to_text: true } };
  nav.path = "/results/";
  nav.params = new URLSearchParams({ check: check.id });
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
  spoken = [];
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} onend?: () => void; onerror?: () => void; lang = ""; });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: (u: { text: string }) => spoken.push(u.text), cancel: () => {}, getVoices: () => [] } });
  FakeRecognition.instances = [];
  FakeRecognition.available = vi.fn(async () => "available");
  FakeRecognition.install = vi.fn(async () => true);
  CloudOnlyRecognition.constructed = 0;
  CloudOnlyRecognition.available = vi.fn();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  mic.allow = true;
  mic.requests = 0;
  FakeMediaRecorder.types = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];
  FakeMediaRecorder.last = null;
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => {
    mic.requests++;
    if (!mic.allow) throw new DOMException("denied", "NotAllowedError");
    return { getTracks: () => [{ stop: () => {} }] };
  } } });
  fetchMock = vi.fn(async (req: Request) => {
    if (req.url.endsWith("/api/transcribe")) return json(fixture("transcribe"));
    if (req.method === "POST") return json({ text: "Because the occupant load is over the limit for one exit.", cited_rules: ["EG-1"], generated_by: "template", problems: [] });
    return json(check);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const openPanel = () => act(() => assistant.open());
const startButton = () => screen.findByRole("button", { name: "Start voice input" });
const box = () => screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement;
const transcribeCalls = () => fetchMock.mock.calls.map((c) => c[0] as Request).filter((r) => r.url.endsWith("/api/transcribe"));

describe("the recording format", () => {
  it("is the first of WebM Opus, MP4, Ogg the browser supports", () => {
    expect([...RECORD_TYPES]).toEqual(["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"]);
    expect(recordType()).toBe("audio/webm;codecs=opus");
    FakeMediaRecorder.types = ["audio/mp4"];                    // Safari
    expect(recordType()).toBe("audio/mp4");
    FakeMediaRecorder.types = ["audio/ogg"];
    expect(recordType()).toBe("audio/ogg");
    FakeMediaRecorder.types = [];
    expect(recordType()).toBeNull();
  });
});

describe("Path A: on this device", () => {
  it("available: words appear live, final text replaces the interim words, and nothing is sent anywhere", async () => {
    useRecognition(FakeRecognition);
    render(<Assistant />);
    openPanel();
    const start = await startButton();
    expect(start.getAttribute("aria-pressed")).toBe("false");
    expect(FakeRecognition.available).not.toHaveBeenCalled();                     // never when the page loads
    fireEvent.click(start);
    await waitFor(() => expect(FakeRecognition.instances).toHaveLength(1));
    expect(FakeRecognition.available).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true });
    const r = FakeRecognition.instances[0];
    expect((r as unknown as { processLocally: boolean }).processLocally).toBe(true);
    expect(r.interimResults).toBe(true);
    expect(r.lang).toBe("en-US");
    expect(r.started).toBe(true);
    const stop = await screen.findByRole("button", { name: "Stop voice input" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toMatch(/^Listening…/);

    act(() => r.say([{ transcript: "why do I need", isFinal: false }]));
    expect(box().value).toBe("why do I need");                                   // live, as interim words
    act(() => r.say([{ transcript: "Why do I need a second exit", isFinal: true }, { transcript: " for my", isFinal: false }]));
    expect(box().value).toBe("Why do I need a second exit for my");
    act(() => r.say([{ transcript: HEARD, isFinal: true }]));
    expect(box().value).toBe(HEARD);                                              // final replaces interim
    fireEvent.click(stop);
    await waitFor(() => expect(screen.getByTestId("heard").textContent).toBe(`We heard: “${HEARD}”. Correct it if needed, then press Send.`));
    expect(screen.getByTestId("heard").getAttribute("aria-live")).toBe("polite");
    expect(transcribeCalls()).toHaveLength(0);                                     // no audio left the device
    expect(FakeMediaRecorder.last).toBeNull();
    expect(fetchMock.mock.calls.filter((c) => (c[0] as Request).url.endsWith("/ask"))).toHaveLength(0);   // nothing sent until Send
  });

  it("the We heard line is kept in the store, so a new panel (the sheet replacing the side panel) still shows it", async () => {
    useRecognition(FakeRecognition);
    const first = render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    await waitFor(() => expect(FakeRecognition.instances).toHaveLength(1));
    const stop = await screen.findByRole("button", { name: "Stop voice input" });
    act(() => FakeRecognition.instances[0].say([{ transcript: HEARD, isFinal: true }]));
    fireEvent.click(stop);
    const line = `We heard: “${HEARD}”. Correct it if needed, then press Send.`;
    await waitFor(() => expect(screen.getByTestId("heard").textContent).toBe(line));
    first.unmount();                                                               // as when the layout changes
    render(<Assistant />);
    expect(box().value).toBe(HEARD);
    expect(screen.getByTestId("heard").textContent).toBe(line);
    act(() => assistant.clear());                                                  // clearing empties the box and the line
    expect(screen.getByTestId("heard").textContent).toBe("");
  });

  it("downloadable: install() runs from the mic press, says so once, then listens", async () => {
    useRecognition(FakeRecognition);
    FakeRecognition.available = vi.fn(async () => "downloadable");
    let finish!: (ok: boolean) => void;
    FakeRecognition.install = vi.fn(() => new Promise<boolean>((res) => { finish = res; }));
    render(<Assistant />);
    openPanel();
    const start = await startButton();
    expect(FakeRecognition.install).not.toHaveBeenCalled();                       // only from the press
    fireEvent.click(start);
    await waitFor(() => expect(FakeRecognition.install).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true }));
    expect(await screen.findByText("Getting voice ready on this device. This happens once.")).toBeTruthy();
    await act(async () => finish(true));
    expect(await screen.findByRole("button", { name: "Stop voice input" })).toBeTruthy();
    expect((FakeRecognition.instances[0] as unknown as { processLocally: boolean }).processLocally).toBe(true);
    expect(transcribeCalls()).toHaveLength(0);
  });

  it("downloadable but the install fails: Path B from then on", async () => {
    useRecognition(FakeRecognition);
    FakeRecognition.available = vi.fn(async () => "downloadable");
    FakeRecognition.install = vi.fn(async () => false);
    render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    expect(await screen.findByText(/Voice on this device stopped/)).toBeTruthy();
    fireEvent.click(await startButton());
    await screen.findByRole("button", { name: "Stop voice input" });
    expect(FakeMediaRecorder.last).not.toBeNull();
    expect(FakeRecognition.instances).toHaveLength(0);
  });
});

describe("Path B: recorded and sent to our API", () => {
  it("unavailable on the device: records with MediaRecorder and sends the real type to /api/transcribe", async () => {
    useRecognition(FakeRecognition);
    FakeRecognition.available = vi.fn(async () => "unavailable");
    let reply!: () => void;
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.url.endsWith("/api/transcribe")) { await new Promise<void>((r) => { reply = r; }); return json(fixture("transcribe")); }
      return json(check);
    });
    render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    const stop = await screen.findByRole("button", { name: "Stop voice input" });
    expect(FakeMediaRecorder.last!.options.mimeType).toBe("audio/webm;codecs=opus");
    expect(screen.getByRole("status").textContent).toMatch(/^Listening…/);
    fireEvent.click(stop);
    expect(await screen.findByText("Turning your speech into text…")).toBeTruthy();
    await waitFor(() => expect(transcribeCalls()).toHaveLength(1));
    const sent = transcribeCalls()[0];
    expect(sent.url).toBe("http://api.test/api/transcribe");
    const audio = (await sent.clone().formData()).get("audio") as File;
    expect(audio.type).toBe("audio/webm;codecs=opus");
    await act(async () => reply());
    await waitFor(() => expect(box().value).toBe(HEARD));
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("Safari-like: recognition without processLocally is never used, not even available(); MP4 goes to our API", async () => {
    vi.stubGlobal("webkitSpeechRecognition", CloudOnlyRecognition);
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = CloudOnlyRecognition;
    FakeMediaRecorder.types = ["audio/mp4"];
    render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));
    await waitFor(() => expect(box().value).toBe(HEARD));
    expect(CloudOnlyRecognition.constructed).toBe(0);
    expect(CloudOnlyRecognition.available).not.toHaveBeenCalled();
    const audio = (await transcribeCalls()[0].clone().formData()).get("audio") as File;
    expect(audio.type).toBe("audio/mp4");
  });
});

describe("Path C and a blocked microphone", () => {
  it("no on-device recognition and no recorder: says voice isn't available, and typing still works", async () => {
    FakeMediaRecorder.types = [];
    render(<Assistant />);
    openPanel();
    expect(await screen.findByText("Voice isn’t available in this browser. Type your question instead.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start voice input" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "What should I fix first?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/over the limit for one exit/);
  });

  it("on-device recognition says unavailable on the press, and nothing can record: the Path C words, typing still works", async () => {
    useRecognition(FakeRecognition);
    FakeRecognition.available = vi.fn(async () => "unavailable");
    FakeMediaRecorder.types = [];
    render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Voice isn’t available in this browser. Type your question instead.");
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(box().disabled).toBe(false);
  });

  it("a server without speech to text still listens on the device (Path A needs no server)", async () => {
    useRecognition(FakeRecognition);
    meta.value = { ...baseMeta, features: { ...baseMeta.features, speech_to_text: false } };
    render(<Assistant />);
    openPanel();
    expect(await startButton()).toBeTruthy();
  });

  it("permission denied on the device: the blocked-microphone words, and the box is left as it was", async () => {
    useRecognition(FakeRecognition);
    render(<Assistant />);
    openPanel();
    fireEvent.change(box(), { target: { value: "My question" } });
    fireEvent.click(await startButton());
    await waitFor(() => expect(FakeRecognition.instances).toHaveLength(1));
    act(() => FakeRecognition.instances[0].onerror?.({ error: "not-allowed" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The microphone is blocked. Allow it in your browser settings, or type your question.");
    expect(box().value).toBe("My question");
    expect(screen.getByRole("button", { name: "Start voice input" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("permission denied for recording: the same words, nothing sent", async () => {
    mic.allow = false;
    render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "The microphone is blocked. Allow it in your browser settings, or type your question.");
    expect(mic.requests).toBe(1);
    expect(transcribeCalls()).toHaveLength(0);
  });
});

describe("answers read aloud", () => {
  it("reads a spoken question's answer as plain text, not a typed one's, and never with Voice off", async () => {
    render(<Assistant />);
    openPanel();
    fireEvent.click(await startButton());
    fireEvent.click(await screen.findByRole("button", { name: "Stop voice input" }));
    await waitFor(() => expect(box().value).toBe(HEARD));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(spoken).toEqual(["Because the occupant load is over the limit for one exit."]));
    expect(screen.getByRole("button", { name: "Stop reading" })).toBeTruthy();

    fireEvent.change(box(), { target: { value: "What should I fix first?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getAllByText(/over the limit for one exit/)).toHaveLength(2));
    expect(spoken).toHaveLength(1);

    fireEvent.click(screen.getByRole("checkbox", { name: /Voice/ }));
    expect(localStorage.getItem("precheck.voice")).toBe("off");
    expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start voice input" })).toBeNull();
  });
});
