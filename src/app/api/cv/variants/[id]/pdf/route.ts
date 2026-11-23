import { renderVariant } from "@/server/services/cv";
import { AppError, errorMessage } from "@/server/context";

export const dynamic = "force-dynamic";

/** GET /api/cv/variants/:id/pdf — the variant rendered on the fly (preview; exports are frozen document versions). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { pdf, variant } = await renderVariant(id);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const name = (variant.fileName ?? `CV-${variant.name}.pdf`).replace(/[^\w.()-]+/g, "-");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return Response.json({ error: { message: errorMessage(error) } }, { status });
  }
}
