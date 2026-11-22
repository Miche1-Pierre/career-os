"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav, TRANSCRIBE_SAMPLE_RATE } from "@/lib/wav";

export type DictationState = "idle" | "recording" | "transcribing";

const MAX_MS = 5 * 60_000;
/** Below this peak level (RMS, 0–1) the recording is considered silent. */
const SILENCE = 0.012;

/** Resamples a recorded clip to 16 kHz mono (what Whisper expects). */
async function toWav16k(blob: Blob): Promise<ArrayBuffer> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * TRANSCRIBE_SAMPLE_RATE)), TRANSCRIBE_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), TRANSCRIBE_SAMPLE_RATE);
  } finally {
    void ctx.close();
  }
}

/**
 * Records from the microphone with a live level meter, then sends the clip to the local Whisper endpoint and returns
 * the text (like Claude's dictation: the text appears once you stop, not while you speak).
 */
export function useDictation({ onText, onError, onLevel }: { onText: (text: string) => void; onError: (message: string) => void; onLevel?: (level: number) => void }) {
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const r = useRef<{ stream?: MediaStream; recorder?: MediaRecorder; chunks: Blob[]; ctx?: AudioContext; raf?: number; timer?: number; startedAt: number; peak: number; cancelled: boolean }>({ chunks: [], startedAt: 0, peak: 0, cancelled: false });
  const levelRef = useRef(onLevel);
  useEffect(() => {
    levelRef.current = onLevel;
  }, [onLevel]);

  const cleanup = useCallback(() => {
    const cur = r.current;
    if (cur.raf) cancelAnimationFrame(cur.raf);
    if (cur.timer) clearInterval(cur.timer);
    cur.stream?.getTracks().forEach((t) => t.stop());
    void cur.ctx?.close().catch(() => undefined);
    cur.raf = cur.timer = undefined;
    cur.stream = cur.ctx = cur.recorder = undefined;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const send = useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      // First use: the server downloads the model; show its progress.
      const poll = window.setInterval(async () => {
        try {
          const res = await fetch("/api/transcribe", { cache: "no-store" });
          const body = (await res.json()) as { data?: { state: string; progress: number | null } };
          setProgress(body.data?.state === "loading" ? (body.data.progress ?? 0) : null);
        } catch {
          /* ignore */
        }
      }, 1000);
      try {
        const wav = await toWav16k(blob);
        const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
        const body = (await res.json().catch(() => ({}))) as { data?: { text: string }; error?: { message?: string } };
        if (!res.ok || !body.data) throw new Error(body.error?.message ?? `Erreur ${res.status}`);
        if (body.data.text) onText(body.data.text);
        else onError("Je n'ai rien compris, réessaie un peu plus près du micro.");
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      } finally {
        clearInterval(poll);
        setProgress(null);
        setState("idle");
      }
    },
    [onError, onText],
  );

  const stop = useCallback(() => {
    const rec = r.current.recorder;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const cancel = useCallback(() => {
    r.current.cancelled = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("Ce navigateur ne permet pas d'enregistrer le micro.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (error) {
      const name = (error as DOMException).name;
      onError(name === "NotAllowedError" ? "Accès au micro refusé : autorise-le dans les réglages du site." : name === "NotFoundError" ? "Aucun micro détecté." : `Micro indisponible (${name}).`);
      return;
    }
    // Let the server load the model while you speak.
    void fetch("/api/transcribe?warmup=1", { method: "POST" }).catch(() => undefined);

    const cur = r.current;
    cur.stream = stream;
    cur.chunks = [];
    cur.peak = 0;
    cur.cancelled = false;
    cur.startedAt = Date.now();
    const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    cur.recorder = recorder;
    recorder.ondataavailable = (e) => e.data.size && cur.chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(cur.chunks, { type: recorder.mimeType });
      const silent = cur.peak < SILENCE;
      const cancelled = cur.cancelled;
      cleanup();
      setElapsedMs(0);
      if (cancelled) setState("idle");
      else if (silent) {
        setState("idle");
        onError("Je n'ai rien entendu : vérifie que le bon micro est sélectionné.");
      } else void send(blob);
    };

    const ctx = new AudioContext();
    cur.ctx = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / data.length);
      cur.peak = Math.max(cur.peak, rms);
      // Square root: quiet speech still moves the meter, loud speech does not saturate it.
      levelRef.current?.(Math.min(1, Math.sqrt(rms) * 1.8));
      cur.raf = requestAnimationFrame(tick);
    };
    cur.raf = requestAnimationFrame(tick);
    cur.timer = window.setInterval(() => {
      const ms = Date.now() - cur.startedAt;
      setElapsedMs(ms);
      if (ms >= MAX_MS) stop();
    }, 200);
    recorder.start(250);
    setState("recording");
  }, [cleanup, onError, send, state, stop]);

  return { state, elapsedMs, progress, start, stop, cancel };
}
