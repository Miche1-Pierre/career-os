import { handleMcpPayload } from "@/server/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** MCP Streamable HTTP endpoint (stateless, JSON responses). Registered for Claude Code in /.mcp.json. */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Content-Type must be application/json" } }, { status: 415 });
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const result = await handleMcpPayload(payload);
  if (result === null) return new Response(null, { status: 202 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

/** No server-initiated SSE stream in stateless mode. */
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
