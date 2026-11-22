import { startChat } from "@/server/chat/chat";
import { AppError, errorMessage } from "@/server/context";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** In-app chat: streams NDJSON events (thread, text deltas, tool calls, done / error). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, { status: 400 });
  }
  try {
    const stream = await startChat(body, new URL(request.url).origin, request.signal);
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 400;
    return Response.json({ error: { code: error instanceof AppError ? error.code : "BAD_REQUEST", message: errorMessage(error) } }, { status });
  }
}
