/**
 * Dictation: local speech-to-text with Whisper (transformers.js on onnxruntime-node). The audio never leaves the
 * machine; the model is downloaded once from the Hugging Face Hub into <data dir>/models (≈ 250 MB for whisper-small).
 *
 * TRANSCRIBE_MODEL (default Xenova/whisper-small), TRANSCRIBE_LANGUAGE (default french, "auto" to detect),
 * TRANSCRIBE=off disables it.
 */
import path from "node:path";
import { storageConfig } from "@/server/storage";
import { TRANSCRIBE_SAMPLE_RATE } from "@/lib/wav";

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;

export interface TranscribeStatus {
  enabled: boolean;
  model: string;
  state: "idle" | "loading" | "ready" | "error";
  /** Download progress of the model files, 0–100 (while loading). */
  progress: number | null;
  error: string | null;
}

const MODEL = () => process.env.TRANSCRIBE_MODEL?.trim() || "Xenova/whisper-small";
const LANGUAGE = () => {
  const v = process.env.TRANSCRIBE_LANGUAGE?.trim().toLowerCase();
  return !v ? "french" : v === "auto" ? null : v;
};
export const transcribeEnabled = () => (process.env.TRANSCRIBE ?? "").trim().toLowerCase() !== "off";

const state = globalThis as unknown as {
  __careerOsAsr?: { promise: Promise<Transcriber> | null; status: TranscribeStatus; files: Map<string, { loaded: number; total: number }> };
};
const asr = (state.__careerOsAsr ??= { promise: null, status: { enabled: true, model: MODEL(), state: "idle", progress: null, error: null }, files: new Map() });

export function transcribeStatus(): TranscribeStatus {
  return { ...asr.status, enabled: transcribeEnabled(), model: MODEL() };
}

/** Loads the model (downloading it the first time). Safe to call repeatedly; a failed load is retried next time. */
export function loadTranscriber(): Promise<Transcriber> {
  if (asr.promise) return asr.promise;
  asr.status = { enabled: true, model: MODEL(), state: "loading", progress: 0, error: null };
  asr.files.clear();
  asr.promise = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.join(storageConfig.dataDir, "models");
    env.allowRemoteModels = true;
    const pipe = await pipeline("automatic-speech-recognition", MODEL(), {
      dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
      device: "cpu",
      progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== "progress" || !p.file || !p.total) return;
        asr.files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        let loaded = 0;
        let total = 0;
        for (const f of asr.files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        asr.status.progress = total ? Math.round((loaded / total) * 100) : null;
      },
    });
    asr.status = { enabled: true, model: MODEL(), state: "ready", progress: 100, error: null };
    return pipe as unknown as Transcriber;
  })().catch((error: unknown) => {
    asr.promise = null;
    asr.status = { enabled: true, model: MODEL(), state: "error", progress: null, error: error instanceof Error ? error.message : String(error) };
    throw error;
  });
  return asr.promise;
}

/** Text of 16 kHz mono samples. */
export async function transcribe(samples: Float32Array): Promise<string> {
  const run = await loadTranscriber();
  const language = LANGUAGE();
  const seconds = samples.length / TRANSCRIBE_SAMPLE_RATE;
  const out = await run(samples, {
    task: "transcribe",
    ...(language ? { language } : {}),
    ...(seconds > 30 ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
  });
  const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text) ?? "";
  return cleanTranscript(text);
}

/** Whisper's usual artifacts on silence or noise ("[Musique]", "Sous-titres réalisés par…"). */
export function cleanTranscript(text: string): string {
  const t = text
    .replace(/\[[^\]]*\]|\([^)]*(musique|music|rires|applaudissements|silence)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(sous-titr(es|age)\b.*|merci d'avoir regard[ée].*|\.+)$/i.test(t)) return "";
  return t;
}
