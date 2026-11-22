import { decodeWav, TRANSCRIBE_SAMPLE_RATE } from "@/lib/wav";
import { loadTranscriber, transcribe, transcribeEnabled, transcribeStatus } from "@/server/ai/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_SECONDS = 6 * 60;

/** GET /api/transcribe — dictation engine status (model download progress on first use). */
export async function GET() {
  return Response.json({ data: transcribeStatus() }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/transcribe — body: 16 kHz mono PCM 16-bit WAV (audio/wav). Returns { data: { text } }.
 * POST /api/transcribe?warmup=1 starts loading the model (called when recording starts) and returns the status.
 */
export async function POST(request: Request) {
  if (!transcribeEnabled()) return Response.json({ error: { code: "DISABLED", message: "La dictée est désactivée (TRANSCRIBE=off)." } }, { status: 503 });
  if (new URL(request.url).searchParams.get("warmup")) {
    loadTranscriber().catch(() => undefined);
    return Response.json({ data: transcribeStatus() });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > (MAX_SECONDS * TRANSCRIBE_SAMPLE_RATE * 2 + 1024)) return Response.json({ error: { code: "TOO_LARGE", message: "Enregistrement trop long (6 minutes maximum)." } }, { status: 413 });
  const wav = decodeWav(new Uint8Array(await request.arrayBuffer()));
  if ("error" in wav) return Response.json({ error: { code: "BAD_REQUEST", message: wav.error } }, { status: 400 });
  if (wav.sampleRate !== TRANSCRIBE_SAMPLE_RATE) return Response.json({ error: { code: "BAD_REQUEST", message: `Expected ${TRANSCRIBE_SAMPLE_RATE} Hz audio` } }, { status: 400 });
  if (wav.samples.length > MAX_SECONDS * TRANSCRIBE_SAMPLE_RATE) return Response.json({ error: { code: "TOO_LARGE", message: "Enregistrement trop long (6 minutes maximum)." } }, { status: 413 });
  try {
    const started = Date.now();
    const text = await transcribe(wav.samples);
    return Response.json({ data: { text, durationMs: Date.now() - started } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: { code: "TRANSCRIBE_FAILED", message: `Transcription impossible : ${message}` } }, { status: 500 });
  }
}
