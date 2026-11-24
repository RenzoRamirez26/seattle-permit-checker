/**
 * Answers read aloud with the browser's own voice (speechSynthesis). The text is passed as plain text, never HTML.
 * A voice that runs on this device (localService) is preferred; some browsers only have online voices, which send the
 * answer's text, never the owner's voice, to the browser maker (Help, "Voice"). Spoken questions: ondevice.ts and
 * recorder.ts.
 */
export const canSpeak = (): boolean => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

export function speak(text: string, onEnd?: () => void): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  const local = window.speechSynthesis.getVoices?.().find((v) => v.localService && v.lang.toLowerCase().startsWith("en"));
  if (local) u.voice = local;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

const KEY = "precheck.voice";
/** The one Voice setting, remembered on this device. On unless the owner turned it off. */
export const voiceSetting = {
  get: (): boolean => {
    try {
      return localStorage.getItem(KEY) !== "off";
    } catch {
      return true;
    }
  },
  set: (on: boolean) => {
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* storage blocked: the setting lasts until the page is closed */
    }
  },
};
