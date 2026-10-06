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
 *           effort?: string | null, timeoutMs?: number, bin?: string, env?: Record<string, string | undefined> }} options
 * @returns {Promise<{ structured: unknown, text: string | null, model: string | null, costUsd: number | null, durationMs: number, turns: number | null }>}
 */
export function runClaude(options) {
  const { system, prompt, schema, model, fallbackModel, effort, timeoutMs = 240_000, bin, env } = options;
  const cwd = workDir();
  let systemFile = null;
  const args = ["-p", "--output-format", "json", "--no-session-persistence", "--tools", "", "--strict-mcp-config", "--setting-sources", "project", "--max-turns", "6"];
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
