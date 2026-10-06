import path from "node:path";
import { AppError } from "@/server/context";
import { extractHtml, normalizeWhitespace } from "./html";

export interface FileExtraction {
  text: string;
  pageCount?: number | null;
  title?: string | null;
  email?: { from: string | null; to: string | null; subject: string | null; date: string | null } | null;
  jsonLd?: unknown[];
  warnings: string[];
}

export const CAPTURE_FILE_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".html", ".htm", ".eml", ".json", ".csv"];

export async function extractPdf(buffer: Buffer): Promise<FileExtraction> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const joined = normalizeWhitespace(Array.isArray(text) ? text.join("\n\n") : text);
  const warnings = joined.length < 50 ? ["Very little text found — the PDF may be a scan (image only)."] : [];
  return { text: joined, pageCount: totalPages, warnings };
}

export async function extractDocx(buffer: Buffer): Promise<FileExtraction> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return { text: normalizeWhitespace(result.value), warnings: result.messages.filter((m) => m.type === "error").map((m) => m.message) };
}

/** Minimal RFC 822 parser for pasted or .eml emails (headers + first text part). */
export function parseEmail(raw: string): FileExtraction {
  const normalized = raw.replace(/\r\n/g, "\n");
  const split = normalized.indexOf("\n\n");
  const headerBlock = split >= 0 ? normalized.slice(0, split) : "";
  let body = split >= 0 ? normalized.slice(split + 2) : normalized;
  const headers: Record<string, string> = {};
  let last = "";
  for (const line of headerBlock.split("\n")) {
    if (/^\s/.test(line) && last) headers[last] += ` ${line.trim()}`;
    else {
      const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
      if (m) {
        last = m[1].toLowerCase();
        headers[last] = m[2];
      }
    }
  }
  const boundary = /boundary="?([^";]+)"?/i.exec(headers["content-type"] ?? "")?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const textPart = parts.find((p) => /content-type:\s*text\/plain/i.test(p)) ?? parts.find((p) => /content-type:\s*text\/html/i.test(p));
    if (textPart) {
      const idx = textPart.indexOf("\n\n");
      let content = idx >= 0 ? textPart.slice(idx + 2) : textPart;
      if (/quoted-printable/i.test(textPart)) content = decodeQuotedPrintable(content);
      if (/base64/i.test(textPart.slice(0, idx))) content = Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8");
      body = /content-type:\s*text\/html/i.test(textPart) ? extractHtml(content).text : content;
    }
  } else if (/quoted-printable/i.test(headers["content-transfer-encoding"] ?? "")) {
    body = decodeQuotedPrintable(body);
  }
  const email = {
    from: decodeMimeWords(headers.from ?? null),
    to: decodeMimeWords(headers.to ?? null),
    subject: decodeMimeWords(headers.subject ?? null),
    date: headers.date ?? null,
  };
  const head = [email.from && `From: ${email.from}`, email.to && `To: ${email.to}`, email.date && `Date: ${email.date}`, email.subject && `Subject: ${email.subject}`]
    .filter(Boolean)
    .join("\n");
  return { text: normalizeWhitespace(`${head}\n\n${body}`), title: email.subject, email, warnings: [] };
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[\u0080-ÿ]{2,}/g, (m) => {
      try {
        return Buffer.from(m, "latin1").toString("utf8");
      } catch {
        return m;
      }
    });
}

function decodeMimeWords(value: string | null) {
  if (!value) return null;
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset: string, enc: string, text: string) => {
    try {
      const buf = enc.toUpperCase() === "B" ? Buffer.from(text, "base64") : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return buf.toString(/utf-?8/i.test(charset) ? "utf8" : "latin1");
    } catch {
      return text;
    }
  });
}

export function looksLikeEmail(text: string): boolean {
  const head = text.slice(0, 1500);
  return /^(from|de)\s*:/im.test(head) && /^(subject|objet|to|à)\s*:/im.test(head);
}

export async function extractFromFile(buffer: Buffer, fileName: string, mimeType?: string | null): Promise<FileExtraction> {
  const ext = path.extname(fileName).toLowerCase();
  if (!CAPTURE_FILE_EXTENSIONS.includes(ext) && mimeType !== "application/pdf") {
    throw new AppError("VALIDATION", `Unsupported file type ${ext || mimeType || ""}. Supported: PDF, DOCX, TXT, MD, HTML, EML.`);
  }
  if (ext === ".pdf" || mimeType === "application/pdf") return extractPdf(buffer);
  if (ext === ".docx") return extractDocx(buffer);
  const text = buffer.toString("utf8");
  if (ext === ".eml") return parseEmail(text);
  if (ext === ".html" || ext === ".htm") {
    const html = extractHtml(text);
    return { text: html.text, title: html.title, jsonLd: html.jsonLd, warnings: [] };
  }
  return { text: normalizeWhitespace(text), warnings: [] };
}
