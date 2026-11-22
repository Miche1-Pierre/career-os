/**
 * Minimal WAV (PCM 16-bit) encoder / decoder for dictation: the browser records, resamples to 16 kHz mono and sends a
 * WAV; the server turns it back into the Float32 samples Whisper expects. Pure and client-safe.
 */

export const TRANSCRIBE_SAMPLE_RATE = 16_000;

/** Mono PCM 16-bit WAV of samples in [-1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Samples of a PCM 16-bit WAV (channels averaged to mono), or an error message. */
export function decodeWav(input: ArrayBuffer | Uint8Array): { sampleRate: number; samples: Float32Array } | { error: string } {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.byteLength < 44 || text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") return { error: "Not a WAV file" };
  let offset = 12;
  let format: { channels: number; sampleRate: number; bits: number; audioFormat: number } | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = { audioFormat: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
    } else if (id === "data") {
      if (!format) return { error: "WAV data before format" };
      if (format.audioFormat !== 1 || format.bits !== 16 || format.channels < 1) return { error: "Only PCM 16-bit WAV is supported" };
      const end = Math.min(bytes.byteLength, body + size);
      const frames = Math.floor((end - body) / (2 * format.channels));
      const samples = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < format.channels; c++) sum += view.getInt16(body + (f * format.channels + c) * 2, true) / 0x8000;
        samples[f] = sum / format.channels;
      }
      return { sampleRate: format.sampleRate, samples };
    }
    offset = body + size + (size % 2);
  }
  return { error: "WAV without data" };
}
