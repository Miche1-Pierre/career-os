import { deleteThread, getThread } from "@/server/chat/chat";
import { AppError, errorMessage } from "@/server/context";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    return Response.json({ data: await getThread(id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: { message: errorMessage(error) } }, { status: error instanceof AppError ? error.status : 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await deleteThread(id);
  return new Response(null, { status: 204 });
}
