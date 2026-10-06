/**
 * AI provider abstraction. Career OS works fully without AI; providers are optional and interchangeable.
 *
 *   AI_PROVIDER=claude-code | anthropic | openai | none
 */
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { claudeVersion, resolveClaudeBin, runClaude } from "../../../bridge/claude-runner.mjs";
import { AppError } from "@/server/context";
import { getSettings } from "@/server/services/settings";
import { toStructuredOutputSchema } from "./json-schema";

export interface StructuredRequest<T> {
  task: string;
  promptVersion: string;
  system: string;
  prompt: string;
  /** Strict schema (converted to JSON Schema for the model). */
  schema: z.ZodType;
  /** Tolerant parser applied to the model output. */
  parse: (value: unknown) => T;
  timeoutMs?: number;
}

export interface StructuredMeta {
  provider: string;
  model: string | null;
  promptId: string;
  promptVersion: string;
  durationMs: number;
  costUsd: number | null;
}

export interface AIStatus {
  provider: string;
  available: boolean;
  mode: string | null;
  model: string | null;
  detail: string;
  setup: string | null;
}

interface ProviderCall {
  system: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  task: string;
  model: string | null;
  effort: string | null;
  timeoutMs: number;
}

interface ProviderResult {
  value: unknown;
  model: string | null;
  costUsd: number | null;
}

interface Provider {
  name: string;
  status(): Promise<AIStatus>;
  call(input: ProviderCall): Promise<ProviderResult>;
}

const env = (key: string) => process.env[key]?.trim() || "";
const inDocker = () => {
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// claude-code: Claude Code CLI headless (container with OAuth token, host CLI, or host bridge)
// ---------------------------------------------------------------------------

type ClaudeMode = "cli" | "bridge" | null;

function claudeMode(): ClaudeMode {
  const forced = env("CLAUDE_CODE_MODE");
  if (forced === "cli" || forced === "bridge") return forced;
  if (env("CLAUDE_CODE_OAUTH_TOKEN") || (env("ANTHROPIC_API_KEY") && env("AI_PROVIDER") === "claude-code" && inDocker())) return "cli";
  if (!inDocker()) return "cli"; // host (npm run dev): the local Claude Code is already logged in
  if (env("CLAUDE_BRIDGE_URL")) return "bridge";
  return null;
}

const versionCache = globalThis as unknown as { __careerOsClaudeVersion?: { value: string | null; at: number } };
async function cachedClaudeVersion() {
  const c = versionCache.__careerOsClaudeVersion;
  if (c && Date.now() - c.at < 5 * 60_000) return c.value;
  const value = (await claudeVersion(resolveClaudeBin()))?.replace(/\s*\(Claude Code\)\s*$/i, "") ?? null;
  versionCache.__careerOsClaudeVersion = { value, at: Date.now() };
  return value;
}

const claudeCodeProvider: Provider = {
  name: "claude-code",
  async status() {
    const mode = claudeMode();
    const model = env("AI_MODEL") || "opus";
    if (mode === "cli") {
      const version = await cachedClaudeVersion();
      if (!version) {
        return {
          provider: "claude-code",
          available: false,
          mode,
          model,
          detail: "Claude Code CLI not found in this environment.",
          setup: inDocker() ? "Rebuild the image with INSTALL_CLAUDE_CLI=true, or use the host bridge (npm run bridge)." : "Install Claude Code: npm i -g @anthropic-ai/claude-code",
        };
      }
      if (inDocker() && !env("CLAUDE_CODE_OAUTH_TOKEN") && !env("ANTHROPIC_API_KEY")) {
        return { provider: "claude-code", available: false, mode, model, detail: "No Claude credentials in the container.", setup: "Run `claude setup-token` on your PC and set CLAUDE_CODE_OAUTH_TOKEN in .env, then restart." };
      }
      return { provider: "claude-code", available: true, mode, model, detail: `Claude Code ${version}${inDocker() ? " (in container)" : " (local)"}`, setup: null };
    }
    if (mode === "bridge") {
      const url = env("CLAUDE_BRIDGE_URL").replace(/\/$/, "");
      try {
        const res = await fetch(`${url}/health`, { headers: { authorization: `Bearer ${env("CLAUDE_BRIDGE_TOKEN")}` }, signal: AbortSignal.timeout(2500) });
        const body = (await res.json()) as { ok?: boolean; authorized?: boolean; claude?: string | null };
        if (!body.ok) throw new Error("bridge not ready");
        if (!body.authorized) return { provider: "claude-code", available: false, mode, model, detail: "Bridge reachable but the token does not match.", setup: "Use the same CLAUDE_BRIDGE_TOKEN in .env for the app and the bridge." };
        if (!body.claude) return { provider: "claude-code", available: false, mode, model, detail: "Bridge running but Claude Code was not found on the host.", setup: "Install Claude Code on your PC or set CLAUDE_BIN for the bridge." };
        return { provider: "claude-code", available: true, mode, model, detail: `Host bridge · Claude Code ${String(body.claude ?? "").replace(/\s*\(Claude Code\)\s*$/i, "")}`, setup: null };
      } catch {
        return {
          provider: "claude-code",
          available: false,
          mode,
          model,
          detail: `Host bridge not reachable at ${url}.`,
          setup: "On your PC, run `npm run bridge` in C:\\Candidature (or scripts\\start-bridge.cmd) — or configure CLAUDE_CODE_OAUTH_TOKEN.",
        };
      }
    }
    return { provider: "claude-code", available: false, mode: null, model, detail: "Claude Code is not configured.", setup: "Set CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) or CLAUDE_BRIDGE_URL in .env." };
  },
  async call(input) {
    const mode = claudeMode();
    const model = input.model || env("AI_MODEL") || "opus";
    const fallbackModel = model === "opus" ? "sonnet" : null;
    if (mode === "bridge") {
      const url = env("CLAUDE_BRIDGE_URL").replace(/\/$/, "");
      const res = await fetch(`${url}/v1/run`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env("CLAUDE_BRIDGE_TOKEN")}` },
        body: JSON.stringify({ system: input.system, prompt: input.prompt, schema: input.jsonSchema, model, fallbackModel, effort: input.effort, timeoutMs: input.timeoutMs }),
        signal: AbortSignal.timeout(input.timeoutMs + 15_000),
      }).catch((error: unknown) => {
        throw new AppError("UNAVAILABLE", `Claude bridge unreachable: ${error instanceof Error ? error.message : error}`);
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; structured?: unknown; model?: string | null; costUsd?: number | null };
      if (!res.ok || !body.ok) throw new AppError("UNAVAILABLE", body.error ?? `Claude bridge error ${res.status}`);
      return { value: body.structured, model: body.model ?? model, costUsd: body.costUsd ?? null };
    }
    if (mode === "cli") {
      const result = await runClaude({ system: input.system, prompt: input.prompt, schema: input.jsonSchema, model, fallbackModel, effort: input.effort, timeoutMs: input.timeoutMs });
      return { value: result.structured, model: result.model ?? model, costUsd: result.costUsd };
    }
    throw new AppError("UNAVAILABLE", "Claude Code is not configured");
  },
};

// ---------------------------------------------------------------------------
// anthropic: official SDK, structured outputs
// ---------------------------------------------------------------------------

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

const anthropicProvider: Provider = {
  name: "anthropic",
  async status() {
    const model = env("AI_MODEL") || DEFAULT_ANTHROPIC_MODEL;
    if (!env("ANTHROPIC_API_KEY")) return { provider: "anthropic", available: false, mode: null, model, detail: "ANTHROPIC_API_KEY is not set.", setup: "Add ANTHROPIC_API_KEY to .env and restart." };
    return { provider: "anthropic", available: true, mode: "api", model, detail: `Anthropic API · ${model}`, setup: null };
  },
  async call(input) {
    const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 2, timeout: input.timeoutMs });
    const model = input.model || env("AI_MODEL") || DEFAULT_ANTHROPIC_MODEL;
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        // Server-side refusal fallback, routed by refusal category.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: input.prompt }],
        output_config: {
          format: { type: "json_schema", schema: input.jsonSchema },
          ...(input.effort ? { effort: input.effort as "low" | "medium" | "high" | "xhigh" | "max" } : {}),
        },
      });
      if (response.stop_reason === "refusal") throw new AppError("UNAVAILABLE", "The model declined this request.");
      if (response.stop_reason === "max_tokens") throw new AppError("UNAVAILABLE", "The model output was truncated (max_tokens).");
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { value: JSON.parse(text), model: response.model, costUsd: null };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Anthropic.AuthenticationError) throw new AppError("UNAVAILABLE", "Invalid Anthropic API key");
      if (error instanceof Anthropic.RateLimitError) throw new AppError("UNAVAILABLE", "Anthropic rate limit reached — retry later");
      if (error instanceof Anthropic.APIError) throw new AppError("UNAVAILABLE", `Anthropic API error ${error.status}: ${error.message}`);
      throw error;
    }
  },
};

// ---------------------------------------------------------------------------
// openai: any OpenAI-compatible chat completions endpoint (OpenAI, Ollama, LM Studio, Gemini…)
// ---------------------------------------------------------------------------

const openaiProvider: Provider = {
  name: "openai",
  async status() {
    const model = env("AI_MODEL") || env("OPENAI_MODEL") || "gpt-4.1-mini";
    const base = env("OPENAI_BASE_URL") || "https://api.openai.com/v1";
    const local = /localhost|127\.0\.0\.1|host\.docker\.internal/.test(base);
    if (!env("OPENAI_API_KEY") && !local) return { provider: "openai", available: false, mode: null, model, detail: "OPENAI_API_KEY is not set.", setup: "Set OPENAI_API_KEY (and OPENAI_BASE_URL for compatible servers)." };
    return { provider: "openai", available: true, mode: local ? "local" : "api", model, detail: `${base} · ${model}`, setup: null };
  },
  async call(input) {
    const base = (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = input.model || env("AI_MODEL") || env("OPENAI_MODEL") || "gpt-4.1-mini";
    const request = (responseFormat: unknown) =>
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(env("OPENAI_API_KEY") ? { authorization: `Bearer ${env("OPENAI_API_KEY")}` } : {}) },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          response_format: responseFormat,
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
      });
    let res = await request({ type: "json_schema", json_schema: { name: input.task, schema: input.jsonSchema, strict: true } });
    if (res.status === 400) {
      // Some compatible servers only support JSON mode: give the schema in the prompt instead.
      input = { ...input, system: `${input.system}\n\nReturn a JSON object matching this JSON Schema:\n${JSON.stringify(input.jsonSchema)}` };
      res = await request({ type: "json_object" });
    }
    const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string }; model?: string };
    if (!res.ok) throw new AppError("UNAVAILABLE", `AI endpoint error ${res.status}: ${body.error?.message ?? ""}`);
    const content = body.choices?.[0]?.message?.content ?? "";
    return { value: JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")), model: body.model ?? model, costUsd: null };
  },
};

const noneProvider: Provider = {
  name: "none",
  async status() {
    return {
      provider: "none",
      available: false,
      mode: null,
      model: null,
      detail: "In-app AI is disabled.",
      setup: "Captures wait in the Inbox. Ask Claude Code in C:\\Candidature: “process my Career OS inbox”.",
    };
  },
  async call() {
    throw new AppError("UNAVAILABLE", "In-app AI is disabled (AI_PROVIDER=none)");
  },
};

const PROVIDERS: Record<string, Provider> = { "claude-code": claudeCodeProvider, anthropic: anthropicProvider, openai: openaiProvider, none: noneProvider };

export function currentProvider(): Provider {
  return PROVIDERS[env("AI_PROVIDER") || "claude-code"] ?? noneProvider;
}

const statusCache = globalThis as unknown as { __careerOsAiStatus?: { value: AIStatus; at: number } };

export async function aiStatus(options: { fresh?: boolean } = {}): Promise<AIStatus> {
  const cached = statusCache.__careerOsAiStatus;
  if (!options.fresh && cached && Date.now() - cached.at < 30_000) return cached.value;
  const settings = await getSettings();
  const value = await currentProvider().status();
  if (settings.ai.model) value.model = settings.ai.model;
  statusCache.__careerOsAiStatus = { value, at: Date.now() };
  return value;
}

const schemaCache = new WeakMap<z.ZodType, Record<string, unknown>>();

/** Runs a versioned prompt and returns validated structured data. */
export async function generateStructured<T>(request: StructuredRequest<T>): Promise<{ data: T; meta: StructuredMeta }> {
  const provider = currentProvider();
  const settings = await getSettings();
  let jsonSchema = schemaCache.get(request.schema);
  if (!jsonSchema) {
    jsonSchema = toStructuredOutputSchema(request.schema);
    schemaCache.set(request.schema, jsonSchema);
  }
  const started = Date.now();
  const result = await provider.call({
    system: request.system,
    prompt: request.prompt,
    jsonSchema,
    task: request.task,
    model: settings.ai.model || null,
    effort: settings.ai.effort || env("AI_EFFORT") || null,
    timeoutMs: request.timeoutMs ?? 240_000,
  });
  if (result.value == null) throw new AppError("UNAVAILABLE", "The AI returned no structured output");
  const data = request.parse(result.value);
  return {
    data,
    meta: {
      provider: provider.name,
      model: result.model,
      promptId: request.task,
      promptVersion: request.promptVersion,
      durationMs: Date.now() - started,
      costUsd: result.costUsd,
    },
  };
}
