/**
 * Minimal, dependency-free MCP server (Streamable HTTP transport, stateless, JSON responses).
 * Spec: https://modelcontextprotocol.io — supports initialize, ping, tools/list, tools/call (+ empty resources/prompts).
 */
import { z } from "zod";
import { CLAUDE, errorMessage } from "@/server/context";
import { MCP_INSTRUCTIONS, TOOLS } from "./tools";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "career-os", title: "Career OS", version: "1.0.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

const toolSchemas = new Map<string, Record<string, unknown>>();

function inputSchemaFor(name: string, schema: z.ZodType) {
  let cached = toolSchemas.get(name);
  if (!cached) {
    const raw = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    delete raw.$schema;
    cached = raw.type === "object" ? raw : { type: "object", properties: {} };
    toolSchemas.set(name, cached);
  }
  return cached;
}

export function listToolsResult() {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: inputSchemaFor(t.name, t.input),
      annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, openWorldHint: false },
    })),
  };
}

async function callTool(params: Record<string, unknown> | undefined) {
  const name = String(params?.name ?? "");
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  const parsed = tool.input.safeParse(params?.arguments ?? {});
  if (!parsed.success) {
    return { content: [{ type: "text", text: `Invalid arguments: ${errorMessage(parsed.error)}` }], isError: true };
  }
  try {
    const result = await tool.handler(parsed.data as never, CLAUDE);
    const text = JSON.stringify(result ?? { ok: true }, (_k, v) => (v instanceof Date ? v.toISOString() : v), 1);
    const structured = result && typeof result === "object" && !Array.isArray(result) ? JSON.parse(text) : { result: JSON.parse(text) };
    return { content: [{ type: "text", text }], structuredContent: structured, isError: false };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${errorMessage(error)}` }], isError: true };
  }
}

async function handleOne(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const isNotification = message.id === undefined || message.id === null;
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  if (isNotification) return null; // notifications/initialized, notifications/cancelled…
  const id = message.id as string | number;
  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? "");
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[1];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
          serverInfo: SERVER_INFO,
          instructions: MCP_INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: listToolsResult() };
    case "tools/call":
      return { jsonrpc: "2.0", id, result: await callTool(message.params) };
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "resources/templates/list":
      return { jsonrpc: "2.0", id, result: { resourceTemplates: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${message.method}` } };
  }
}

export async function handleMcpPayload(payload: unknown): Promise<unknown | null> {
  if (Array.isArray(payload)) {
    const results = (await Promise.all(payload.map((m) => handleOne(m as JsonRpcRequest)))).filter(Boolean);
    return results.length ? results : null;
  }
  return handleOne(payload as JsonRpcRequest);
}
