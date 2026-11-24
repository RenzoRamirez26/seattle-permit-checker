/**
 * Push to talk: press once to record, again to stop (or it stops by itself at the API's limit). The recording stays
 * in this page's memory until it is converted to WAV and sent to our API, and nowhere else.
 */
import { toWav } from "./wav";

export const canRecord = (): boolean =>
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";

export type Recording = { stop: () => Promise<Blob>; cancel: () => void };

/** Starts recording; throws "microphone_blocked" when the browser or the owner refuses the microphone. */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error("microphone_blocked");
  }
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  recorder.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          release();
          toWav(new Blob(parts, { type: recorder.mimeType })).then(resolve, reject);
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
