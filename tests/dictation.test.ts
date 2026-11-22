import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav, TRANSCRIBE_SAMPLE_RATE } from "@/lib/wav";
import { cleanTranscript } from "@/server/ai/transcribe";

describe("dictation audio", () => {
  it("round-trips samples through a 16-bit WAV", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 0.25]);
    const wav = encodeWav(samples, TRANSCRIBE_SAMPLE_RATE);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
    const out = decodeWav(wav);
    if ("error" in out) throw new Error(out.error);
    expect(out.sampleRate).toBe(16_000);
    expect(Array.from(out.samples).map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 1, -1, 0.25]);
  });

  it("mixes stereo to mono and refuses what is not PCM 16-bit", () => {
    // Stereo frame (0.5, -0.5) then (1, 1).
    const stereo = new ArrayBuffer(44 + 8);
    const v = new DataView(stereo);
    const ascii = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    ascii(0, "RIFF");
    v.setUint32(4, 44, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, 16_000, true);
    v.setUint16(34, 16, true);
    ascii(36, "data");
    v.setUint32(40, 8, true);
    [0x4000, -0x4000, 0x7fff, 0x7fff].forEach((x, i) => v.setInt16(44 + i * 2, x, true));
    const out = decodeWav(stereo);
    if ("error" in out) throw new Error(out.error);
    expect(Array.from(out.samples).map((x) => Math.round(x * 100) / 100)).toEqual([0, 1]);

    expect(decodeWav(new Uint8Array([1, 2, 3]))).toEqual({ error: "Not a WAV file" });
    v.setUint16(34, 8, true); // 8-bit
    expect(decodeWav(stereo)).toEqual({ error: "Only PCM 16-bit WAV is supported" });
  });

  it("drops Whisper's usual hallucinations on silence", () => {
    expect(cleanTranscript(" Ajoute cette offre  [Musique] ")).toBe("Ajoute cette offre");
    expect(cleanTranscript("Sous-titres réalisés par la communauté d'Amara.org")).toBe("");
    expect(cleanTranscript("...")).toBe("");
    expect(cleanTranscript("Relance Roche demain")).toBe("Relance Roche demain");
  });
});
