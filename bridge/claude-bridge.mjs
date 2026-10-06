#!/usr/bin/env node
// Career OS — Claude bridge.
//
// Lets the Career OS container use the Claude Code already installed and logged in on THIS computer,
// without any token. Start it with `npm run bridge` (or scripts/start-bridge.cmd) and keep it running.
//
// Security: listens on 127.0.0.1 only, requires the shared CLAUDE_BRIDGE_TOKEN (read from ../.env),
// and only runs Claude in headless mode with NO tools (pure text → JSON extraction).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { claudeVersion, resolveClaudeBin, runClaude } from "./claude-runner.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function readEnvFile() {
  const file = path.join(here, "..", ".env");
  const values = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trim().startsWith("#")) values[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env */
  }
  return values;
}

const fileEnv = readEnvFile();
const PORT = Number(process.env.CLAUDE_BRIDGE_PORT || fileEnv.CLAUDE_BRIDGE_PORT || 4319);
const HOST = process.env.CLAUDE_BRIDGE_HOST || fileEnv.CLAUDE_BRIDGE_HOST || "127.0.0.1";
const TOKEN = process.env.CLAUDE_BRIDGE_TOKEN || fileEnv.CLAUDE_BRIDGE_TOKEN || "";
const MAX_BODY = 2 * 1024 * 1024;
const MAX_CONCURRENT = 2;
const BIN = resolveClaudeBin();

if (!TOKEN || TOKEN === "change-me") {
  console.error("CLAUDE_BRIDGE_TOKEN is missing (or still 'change-me') in .env — refusing to start.");
  process.exit(1);
}

let running = 0;
const version = await claudeVersion(BIN);

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers.authorization ?? "";
  const authorized = auth.startsWith("Bearer ") && safeEqual(auth.slice(7), TOKEN);
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, authorized, claude: version, busy: running });
  }
  if (!authorized) return send(res, 401, { ok: false, error: "Unauthorized" });
  if (req.method !== "POST" || req.url !== "/v1/run") return send(res, 404, { ok: false, error: "Not found" });
  if (running >= MAX_CONCURRENT) return send(res, 429, { ok: false, error: "Bridge busy, retry shortly" });

  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return send(res, 413, { ok: false, error: "Payload too large" });
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return send(res, 400, { ok: false, error: "Invalid JSON" });
  }
  if (typeof body.prompt !== "string" || !body.prompt) return send(res, 400, { ok: false, error: "prompt required" });
  const pick = (v, re) => (typeof v === "string" && re.test(v) ? v : null);

  running++;
  const started = Date.now();
  try {
    const result = await runClaude({
      system: typeof body.system === "string" ? body.system : undefined,
      prompt: body.prompt,
      schema: body.schema && typeof body.schema === "object" ? body.schema : undefined,
      model: pick(body.model, /^[a-z0-9.\-[\]]{1,60}$/i),
      fallbackModel: pick(body.fallbackModel, /^[a-z0-9.\-[\]]{1,60}$/i),
      effort: pick(body.effort, /^(low|medium|high|xhigh|max)$/),
      timeoutMs: Math.min(Number(body.timeoutMs) || 240_000, 600_000),
      bin: BIN,
    });
    console.log(`[bridge] ${new Date().toISOString()} ok ${result.model ?? "?"} ${Date.now() - started}ms`);
    send(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error(`[bridge] ${new Date().toISOString()} error: ${error.message}`);
    send(res, 502, { ok: false, error: error.message });
  } finally {
    running--;
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use: the Career OS bridge is probably already running (or change CLAUDE_BRIDGE_PORT).`);
  } else {
    console.error(`Bridge error: ${error.message}`);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Career OS Claude bridge listening on http://${HOST}:${PORT}`);
  console.log(`Claude Code: ${version ?? "NOT FOUND — install it or set CLAUDE_BIN"} (${BIN})`);
  console.log("Keep this window open while you use AI features in Career OS. Ctrl+C to stop.");
});
