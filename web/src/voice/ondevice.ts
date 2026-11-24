/**
 * Path A of voice input: the browser's own speech recognition, used only when it runs on this device
 * (processLocally = true), so no audio leaves the device. Never used otherwise: if this browser's
 * SpeechRecognition (or webkitSpeechRecognition) has no processLocally, onDevice() returns null and the
 * assistant records instead (Path B, recorder.ts), whose audio goes to our API only.
 * This is the one file allowed to name SpeechRecognition (scripts/guard.mjs checks it sets processLocally = true).
 *
 * In:  nothing to detect; a mic press to install the language pack (install() needs the press) and to listen.
 * Out: onDeviceStatus() "available" | "downloadable" | "unavailable"; listen() calls back with the words heard so far
 *      (final words, then the interim ones), and once when it ends.
 */
const LANGS = ["en-US"];
const OPTIONS = { langs: LANGS, processLocally: true } as const;

type Alt = { transcript: string };
type ResultList = ArrayLike<ArrayLike<Alt> & { isFinal: boolean }>;
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; processLocally: boolean;
  onresult: ((e: { results: ResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionClass = {
  new (): Recognition;
  prototype: object;
  available?: (o: typeof OPTIONS) => Promise<string>;
  install?: (o: typeof OPTIONS) => Promise<boolean>;
};

/** The browser's recognition class, only when it can be told to process locally. */
export function onDevice(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!C || !C.prototype || !("processLocally" in C.prototype)) return null;     // no on-device option: never cloud
  return C;
}

export type OnDeviceStatus = "available" | "downloadable" | "unavailable";

/** Whether English recognition can run on this device now, after a one-time download, or not at all. */
export async function onDeviceStatus(): Promise<OnDeviceStatus> {
  const C = onDevice();
  if (!C) return "unavailable";
  if (typeof C.available !== "function") return "available";   // processLocally exists; a start error falls back to Path B
  try {
    const s = await C.available(OPTIONS);
    if (s === "available") return "available";
    if (s === "downloadable" || s === "downloading") return "downloadable";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Downloads the English language pack to this device. Call it from the mic press. True when it is ready. */
export async function installOnDevice(): Promise<boolean> {
  const C = onDevice();
  if (!C || typeof C.install !== "function") return false;
  try {
    return (await C.install(OPTIONS)) === true;
  } catch {
    return false;
  }
}

/** Why listening stopped early, in the assistant's error codes (api/errors.ts). */
export function errorCode(error: string): string {
  if (error === "not-allowed") return "microphone_blocked";
  if (error === "no-speech") return "no_speech_heard";
  return "ondevice_failed";                                   // language pack missing, audio capture, anything else
}

export type Listening = { stop: () => void; cancel: () => void };

/** Starts listening on this device. onWords gets the final words so far and the interim words after them. */
export function listen(on: { onWords: (final: string, interim: string) => void; onEnd: () => void; onError: (code: string) => void }): Listening {
  const C = onDevice();
  if (!C) throw new Error("ondevice_failed");
  const r = new C();
  r.processLocally = true;
  if (r.processLocally !== true) throw new Error("ondevice_failed");   // never let it fall back to a server
  r.lang = LANGS[0];
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 1;
  let failed = false;
  r.onresult = (e) => {
    let final = "", interim = "";
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    on.onWords(final.trim(), interim.trim());
  };
  r.onerror = (e) => {
    if (e.error === "aborted") return;
    failed = true;
    on.onError(errorCode(e.error));
  };
  r.onend = () => {
    if (!failed) on.onEnd();
  };
  r.start();
  return {
    stop: () => r.stop(),
    cancel: () => {
      r.onresult = r.onerror = r.onend = null;
      r.abort();
    },
  };
}
