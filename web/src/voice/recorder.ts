/**
 * Path B of voice input: press once to record, again to stop (or it stops by itself at the API's limit). The
 * recording is sent to our API only, in the format the browser recorded, with its real content type; the API converts
 * it with ffmpeg and turns it into text on our server. It is never sent to Google, Apple or anyone else.
 *
 * In:  the microphone, after the owner allows it.  Out: one Blob whose type is the first of RECORD_TYPES the browser
 * supports.
 */

/** The formats tried, in order: Chrome, Edge and Firefox record WebM Opus; Safari MP4; some Firefox builds Ogg. */
export const RECORD_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"] as const;

/** The first format this browser can record, or null when it cannot record at all (Path C). */
export function recordType(): string | null {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") return null;
  const ok = typeof MediaRecorder.isTypeSupported === "function" ? (t: string) => MediaRecorder.isTypeSupported(t) : () => false;
  return RECORD_TYPES.find(ok) ?? null;
}

export const canRecord = (): boolean => recordType() !== null;

export type Recording = { type: string; stop: () => Promise<Blob>; cancel: () => void };

/** Starts recording; throws "microphone_blocked" when the browser or the owner refuses the microphone. */
export async function startRecording(): Promise<Recording> {
  const type = recordType();
  if (!type) throw new Error("no_recording");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error("microphone_blocked");
  }
  const recorder = new MediaRecorder(stream, { mimeType: type });
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  recorder.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    type,
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          release();
          resolve(new Blob(parts, { type }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== "inactive") recorder.stop();
      else release();
    },
  };
}

/** The file name sent with a recording, from its type: question.webm, question.mp4 or question.ogg. */
export const fileName = (type: string) => `question.${type.split(";")[0].split("/")[1] ?? "audio"}`;
