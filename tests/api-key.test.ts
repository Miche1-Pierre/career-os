import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicKey, apiKeyState, checkAnthropicKey, claudeKeyEnv, keyHint, normalizeApiKey, removeAnthropicKey, saveAnthropicKey, storedAnthropicKey } from "@/server/ai/credentials";
import { chatAvailable, currentProvider } from "@/server/ai";

const KEY = "sk-ant-api03-" + "a".repeat(40) + "WXYZ";
const saved = { ...process.env };
let dir = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "career-os-key-"));
  process.env.APP_DATA_DIR = dir;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AI_PROVIDER;
});
afterEach(() => {
  process.env = { ...saved };
});

const ok = async () => {};

describe("Claude API key pasted in the app", () => {
  it("cleans what people paste and rejects what is not a key", () => {
    expect(normalizeApiKey(`  "${KEY}"  `)).toBe(KEY);
    expect(normalizeApiKey(`ANTHROPIC_API_KEY=${KEY}`)).toBe(KEY);
    expect(normalizeApiKey(`${KEY.slice(0, 20)}\n${KEY.slice(20)}`)).toBe(KEY);
    expect(() => normalizeApiKey("sk-proj-abcdef")).toThrow(/sk-ant-/);
    expect(() => normalizeApiKey("")).toThrow();
    expect(keyHint(KEY)).toBe("sk-ant-…WXYZ");
  });

  it("stores the key outside the database, uses it everywhere, and forgets it", async () => {
    expect(storedAnthropicKey()).toBeNull();
    expect(await saveAnthropicKey(KEY, { check: ok })).toEqual({ hint: "sk-ant-…WXYZ" });
    expect(fs.existsSync(path.join(dir, "secrets.json"))).toBe(true);
    expect(storedAnthropicKey()).toBe(KEY);
    expect(anthropicKey()).toBe(KEY);
    // Claude Code runs with the key and its own empty configuration, so a subscription login cannot take over.
    expect(claudeKeyEnv()).toEqual({ ANTHROPIC_API_KEY: KEY, CLAUDE_CODE_OAUTH_TOKEN: undefined, CLAUDE_CONFIG_DIR: path.join(dir, "claude-api") });
    expect(fs.statSync(path.join(dir, "claude-api")).isDirectory()).toBe(true);
    expect(apiKeyState()).toMatchObject({ source: "app", hint: "sk-ant-…WXYZ" });
    removeAnthropicKey();
    expect(storedAnthropicKey()).toBeNull();
    expect(claudeKeyEnv()).toBeUndefined();
    expect(apiKeyState().source).toBeNull();
  });

  it("does not store a key Anthropic refuses", async () => {
    await expect(saveAnthropicKey(KEY, { check: async () => Promise.reject(new Error("refusée")) })).rejects.toThrow("refusée");
    expect(storedAnthropicKey()).toBeNull();
  });

  it("turns Anthropic's answers into plain messages", async () => {
    const failing = (error: Error) => ({ models: { list: () => Promise.reject(error) } }) as unknown as Pick<Anthropic, "models">;
    const auth = new Anthropic.AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers());
    await expect(checkAnthropicKey(KEY, failing(auth))).rejects.toThrow(/refuse cette clé/);
    await expect(checkAnthropicKey(KEY, failing(new Anthropic.APIConnectionError({ message: "offline" })))).rejects.toThrow(/connexion internet/);
    await expect(checkAnthropicKey(KEY, { models: { list: async () => ({ data: [] }) } } as unknown as Pick<Anthropic, "models">)).resolves.toBeUndefined();
  });

  it("keeps the subscription when no key is pasted, and turns the assistant on when one is", async () => {
    process.env.AI_PROVIDER = "none";
    expect(currentProvider().name).toBe("none");
    expect(chatAvailable()).toBe(false);
    await saveAnthropicKey(KEY, { check: ok });
    expect(currentProvider().name).toBe("claude-code");
    expect(chatAvailable()).toBe(true);
  });

  it("uses a .env key for Claude Code only when the install chose the API", () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    process.env.AI_PROVIDER = "claude-code";
    expect(claudeKeyEnv()).toBeUndefined(); // subscription install: the CLI keeps its own login
    process.env.AI_PROVIDER = "anthropic";
    expect(claudeKeyEnv()).toMatchObject({ ANTHROPIC_API_KEY: KEY, CLAUDE_CONFIG_DIR: path.join(dir, "claude-api") });
    expect(apiKeyState()).toMatchObject({ source: "env" });
  });
});

describe("Claude errors in plain French", () => {
  it("explains key and credit problems, and leaves other messages alone", async () => {
    const { explainClaudeError } = await import("@/server/ai/credentials");
    expect(explainClaudeError("Invalid API key · Fix external API key")).toMatch(/Remplace-la dans Paramètres → IA/);
    expect(explainClaudeError("400 invalid_request_error: Your credit balance is too low to access the Anthropic API")).toMatch(/Plus de crédit/);
    expect(explainClaudeError("API Error: 529 overloaded")).toMatch(/très sollicité/);
    expect(explainClaudeError("Timeout after 600000 ms")).toBe("Timeout after 600000 ms");
  });
});

describe("Windows install: Claude Code without an account", () => {
  it("asks for a key until one is pasted", async () => {
    process.env.CLAUDE_REQUIRES_KEY = "true";
    process.env.USERPROFILE = dir; // no .claude/.credentials.json here
    process.env.HOME = dir;
    const { claudeNeedsKey } = await import("@/server/ai/credentials");
    expect(claudeNeedsKey()).toBe(true);
    await saveAnthropicKey(KEY, { check: ok });
    expect(claudeNeedsKey()).toBe(false);
    removeAnthropicKey();
    // Also logged in with a subscription on this computer: that login works for the app.
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude", ".credentials.json"), "{}");
    expect(claudeNeedsKey()).toBe(false);
  });

  it("changes nothing for other installs", async () => {
    const { claudeNeedsKey } = await import("@/server/ai/credentials");
    delete process.env.CLAUDE_REQUIRES_KEY;
    expect(claudeNeedsKey()).toBe(false);
  });
});
