import { dispatch } from "@/server/api/router";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, { params }: Params) {
  const { path } = await params;
  return dispatch(request, path ?? []);
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
