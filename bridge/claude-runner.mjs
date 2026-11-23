// Career OS — runs Claude Code in headless mode for structured extraction.
// Shared by the app (inside Docker, with CLAUDE_CODE_OAUTH_TOKEN) and by the host bridge (claude-bridge.mjs).
// Zero dependencies. Claude runs with NO tools, no MCP servers, no project settings, in an empty directory.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/** @returns {string} */
export function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const home = os.homedir();
  /** @type {string[]} */
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
          path.join(home, ".local", "bin", "claude.exe"),
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "claude", "claude.exe"),
        ]
      : [path.join(home, ".local", "bin", "claude"), "/usr/local/bin/claude", "/usr/bin/claude", path.join(home, ".npm-global", "bin", "claude")];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(/*turbopackIgnore: true*/ candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return process.platform === "win32" ? "claude.exe" : "claude";
}

function workDir() {
  const dir = path.join(os.tmpdir(), "career-os-claude");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {{ system?: string, prompt: string, schema?: object, model?: string | null, fallbackModel?: string | null,
 *           effort?: string | null, timeoutMs?: number, bin?: string, env?: Record<string, string | undefined>,
 *           webTools?: boolean }} options  webTools: allow WebSearch / WebFetch (research tasks only)
 * @returns {Promise<{ structured: unknown, text: string | null, model: string | null, costUsd: number | null, durationMs: number, turns: number | null }>}
 */
export function runClaude(options) {
  const { system, prompt, schema, model, fallbackModel, effort, timeoutMs = 240_000, bin, env, webTools = false } = options;
  const cwd = workDir();
  let systemFile = null;
  const tools = webTools ? "WebSearch,WebFetch" : "";
  const args = ["-p", "--output-format", "json", "--no-session-persistence", "--tools", tools, "--strict-mcp-config", "--setting-sources", "project", "--max-turns", webTools ? "60" : "6"];
  if (webTools) args.push("--allowedTools", tools);
  if (system) {
    systemFile = path.join(cwd, `system-${crypto.randomUUID()}.txt`);
    fs.writeFileSync(systemFile, system, "utf8");
    args.push("--system-prompt-file", systemFile);
  }
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  if (model) args.push("--model", model);
  if (fallbackModel && fallbackModel !== model) args.push("--fallback-model", fallbackModel);
  if (effort) args.push("--effort", effort);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    let settled = false;
    const cleanup = () => {
      if (systemFile) fs.rm(systemFile, { force: true }, () => {});
    };
    const child = spawn(/*turbopackIgnore: true*/ bin ?? resolveClaudeBin(), args, {
      cwd,
      env: { ...process.env, ...env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const out = [];
    const err = [];
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      cleanup();
      reject(new Error(`Claude Code timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT"
            ? "Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code) or set CLAUDE_BIN."
            : `Could not start Claude Code: ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      const stdout = Buffer.concat(out).toString("utf8").trim();
      const stderr = Buffer.concat(err).toString("utf8").trim();
      /** @type {any} */
      let parsed = null;
      const lastBrace = stdout.lastIndexOf("\n{");
      for (const candidate of [stdout, lastBrace >= 0 ? stdout.slice(lastBrace + 1) : ""]) {
        if (!candidate) continue;
        try {
          parsed = JSON.parse(candidate);
          break;
        } catch {
          /* try next */
        }
      }
      if (!parsed) {
        reject(new Error(`Claude Code failed (exit ${code}): ${(stderr || stdout).slice(0, 600) || "no output"}`));
        return;
      }
      if (parsed.is_error || parsed.subtype !== "success") {
        const detail = parsed.result || parsed.subtype || stderr || "unknown error";
        reject(new Error(`Claude Code error: ${String(detail).slice(0, 600)}`));
        return;
      }
      let structured = parsed.structured_output ?? null;
      if (structured == null && typeof parsed.result === "string") {
        try {
          structured = JSON.parse(parsed.result);
        } catch {
          structured = null;
        }
      }
      resolve({
        structured,
        text: typeof parsed.result === "string" ? parsed.result : null,
        model: Object.keys(parsed.modelUsage ?? {})[0] ?? null,
        costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
        durationMs: typeof parsed.duration_ms === "number" ? parsed.duration_ms : Date.now() - started,
        turns: typeof parsed.num_turns === "number" ? parsed.num_turns : null,
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt, "utf8");
  });
}

/** @returns {Promise<string | null>} */
export function claudeVersion(bin) {
  return new Promise((resolve) => {
    try {
      const child = spawn(/*turbopackIgnore: true*/ bin ?? resolveClaudeBin(), ["--version"], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      const out = [];
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(null);
      }, 10_000);
      child.stdout.on("data", (d) => out.push(d));
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? Buffer.concat(out).toString("utf8").trim().replace(/\s*\(Claude Code\)\s*$/i, "") : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Agent mode for the in-app chat: Claude Code with ONLY the Career OS MCP tools + WebSearch/WebFetch (no shell,
 * no file access), streamed as normalized events. Resumes a previous Claude session when `sessionId` is given.
 *
 * Events: { type: "session", sessionId } · { type: "text", delta } · { type: "tool", name, input }
 *         · { type: "done", text, sessionId, model, costUsd, durationMs } · { type: "error", message }
 *
 * @param {{ system: string, prompt: string, mcpUrl: string, mcpHeaders?: Record<string, string>, model?: string | null,
 *           sessionId?: string | null, maxTurns?: number, timeoutMs?: number, bin?: string,
 *           env?: Record<string, string | undefined>, webTools?: boolean }} options
 * @param {(event: Record<string, unknown>) => void} onEvent
 * @returns {{ done: Promise<void>, cancel: () => void }}
 */
export function streamClaude(options, onEvent) {
  const { system, prompt, mcpUrl, mcpHeaders, model, sessionId, maxTurns = 40, timeoutMs = 600_000, bin, env, webTools = true } = options;
  const cwd = path.join(workDir(), "chat");
  fs.mkdirSync(cwd, { recursive: true });
  const systemFile = path.join(cwd, `system-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(systemFile, system, "utf8");
  const mcpConfig = JSON.stringify({ mcpServers: { "career-os": { type: "http", url: mcpUrl, ...(mcpHeaders ? { headers: mcpHeaders } : {}) } } });
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfig,
    "--tools",
    webTools ? "WebSearch,WebFetch" : "",
    "--allowedTools",
    webTools ? "mcp__career-os,WebSearch,WebFetch" : "mcp__career-os",
    "--max-turns",
    String(maxTurns),
    "--system-prompt-file",
    systemFile,
  ];
  if (model) args.push("--model", model);
  if (sessionId) args.push("--resume", sessionId);

  let child;
  let cancelled = false;
  const done = new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    let text = "";
    let lastSession = sessionId ?? null;
    let afterTool = false;
    const finish = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.rm(systemFile, { force: true }, () => {});
      if (event) onEvent(event);
      resolve();
    };
    child = spawn(/*turbopackIgnore: true*/ bin ?? resolveClaudeBin(), args, {
      cwd,
      env: { ...process.env, ...env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ type: "error", message: `Claude Code timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    const err = [];
    let buffer = "";
    child.stderr.on("data", (d) => err.push(d));
    child.stdout.on("data", (d) => {
      buffer += d.toString("utf8");
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.session_id && msg.session_id !== lastSession) {
          lastSession = msg.session_id;
          onEvent({ type: "session", sessionId: lastSession });
        }
        if (msg.type === "stream_event" && msg.event) {
          const ev = msg.event;
          if (ev.type === "content_block_start" && ev.content_block?.type === "text" && afterTool && text) {
            text += "\n\n";
            onEvent({ type: "text", delta: "\n\n" });
            afterTool = false;
          }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            text += ev.delta.text;
            onEvent({ type: "text", delta: ev.delta.text });
          }
        } else if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
            if (block.type === "tool_use") {
              afterTool = true;
              onEvent({ type: "tool", name: String(block.name ?? ""), input: block.input ?? null });
            }
          }
        } else if (msg.type === "result") {
          const ok = msg.subtype === "success" && !msg.is_error;
          const finalText = typeof msg.result === "string" && msg.result.trim() ? msg.result : text;
          finish(
            ok
              ? {
                  type: "done",
                  text: text.trim() ? text : finalText,
                  sessionId: lastSession,
                  model: Object.keys(msg.modelUsage ?? {})[0] ?? null,
                  costUsd: typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : null,
                  durationMs: typeof msg.duration_ms === "number" ? msg.duration_ms : Date.now() - started,
                }
              : { type: "error", message: String(msg.result || msg.subtype || "Claude Code error").slice(0, 600), sessionId: lastSession },
          );
        }
      }
    });
    child.on("error", (error) => {
      finish({
        type: "error",
        message:
          /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT"
            ? "Claude Code CLI not found. Install it (npm i -g @anthropic-ai/claude-code) or set CLAUDE_BIN."
            : `Could not start Claude Code: ${error.message}`,
      });
    });
    child.on("close", (code) => {
      if (cancelled) return finish({ type: "error", message: "Cancelled" });
      const stderr = Buffer.concat(err).toString("utf8").trim();
      finish({ type: "error", message: `Claude Code stopped (exit ${code}) ${stderr.slice(0, 500)}`.trim() });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt, "utf8");
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      try {
        child?.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Claude subscription usage (5-hour window and 7-day window), read with the Claude Code login of this computer
 * (~/.claude/.credentials.json, same source as Claude Code's /usage). Long-lived `claude setup-token` tokens lack
 * the required `user:profile` scope, so this only works where the interactive login lives (host / bridge).
 * Returns utilization percentages only — never the token.
 *
 * @returns {Promise<{ fiveHour: { utilization: number, resetsAt: string | null } | null, sevenDay: { utilization: number, resetsAt: string | null } | null, plan: string | null }>}
 */
export async function readClaudeUsage() {
  const file = path.join(os.homedir(), ".claude", ".credentials.json");
  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8"))?.claudeAiOauth;
  } catch {
    throw new Error("Claude Code login not found on this computer (run `claude` once and sign in).");
  }
  if (!creds?.accessToken) throw new Error("Claude Code login not found on this computer.");
  if (creds.expiresAt && creds.expiresAt < Date.now()) throw new Error("Claude Code login expired: open Claude Code once to refresh it.");
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${creds.accessToken}`, "anthropic-beta": "oauth-2025-04-20" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Usage API error ${res.status}`);
  const body = await res.json();
  const win = (w) => (w && typeof w.utilization === "number" ? { utilization: w.utilization, resetsAt: w.resets_at ?? null } : null);
  return { fiveHour: win(body.five_hour), sevenDay: win(body.seven_day), plan: creds.subscriptionType ?? null };
}
