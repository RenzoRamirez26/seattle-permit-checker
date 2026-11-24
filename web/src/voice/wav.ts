/**
 * 16 kHz mono 16-bit WAV, the format checker/voice.py was built and measured on. Chrome records WebM and Safari MP4,
 * so every recording is decoded and converted here before it is sent (no package needed).
 * In: samples (-1 to 1) at 16 kHz, one channel.  Out: a WAV file.
 */
export const WAV_RATE = 16000;

export function encodeWav(samples: Float32Array, rate = WAV_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);          // size of the format block
  v.setUint16(20, 1, true);           // PCM
  v.setUint16(22, 1, true);           // one channel
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);    // bytes a second
  v.setUint16(32, 2, true);           // bytes a frame
  v.setUint16(34, 16, true);          // bits a sample
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return bytes;
}

/** Any recording the browser can decode, as 16 kHz mono WAV (decoded, mixed down and resampled by Web Audio). */
export async function toWav(recording: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * WAV_RATE));
    const offline = new OfflineAudioContext(1, length, WAV_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0)) as BlobPart], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}
