import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { AppError } from "@/server/context";
import { resolveVersionFile } from "@/server/services/documents";
import { isInlineSafe, mimeFor, resolveLibraryPath, statSafe } from "@/server/storage";
import { backupPath } from "@/server/services/data-transfer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

function contentDisposition(fileName: string, download: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function stream(abs: string, fileName: string, size: number, download: boolean) {
  const inline = !download && isInlineSafe(fileName);
  const body = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  const headers: Record<string, string> = {
    "content-type": inline ? mimeFor(fileName) : "application/octet-stream",
    "content-length": String(size),
    "content-disposition": contentDisposition(fileName, !inline),
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=0, must-revalidate",
  };
  // PDFs need the browser's built-in viewer (a sandbox CSP would break it); other inline types are sandboxed.
  if (!fileName.toLowerCase().endsWith(".pdf")) headers["content-security-policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  return new Response(body, { headers });
}

/**
 * GET /api/files/versions/:id?source=snapshot|current&download=1  — a registered document version
 * GET /api/files/library?path=CV/file.pdf                          — a raw file of the documents library
 * GET /api/files/backups/:name                                     — a backup file
 */
export async function GET(request: Request, { params }: Params) {
  const { path: segments } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";
  try {
    if (segments[0] === "versions" && segments[1]) {
      const source = url.searchParams.get("source") === "current" ? "current" : "snapshot";
      const file = await resolveVersionFile(segments[1], source);
      return stream(file.path, file.fileName, file.size, download);
    }
    if (segments[0] === "library") {
      const rel = url.searchParams.get("path") ?? "";
      const abs = resolveLibraryPath(rel);
      const st = await statSafe(abs);
      if (!st) throw new AppError("NOT_FOUND", "File not found");
      return stream(abs, path.basename(abs), st.size, download);
    }
    if (segments[0] === "backups" && segments[1]) {
      const abs = backupPath(segments[1]);
      const st = await statSafe(abs);
      if (!st) throw new AppError("NOT_FOUND", "Backup not found");
      return stream(abs, segments[1], st.size, true);
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return new Response(error instanceof AppError ? error.message : "Error", { status });
  }
}
