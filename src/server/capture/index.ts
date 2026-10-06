import { createHash } from "node:crypto";
import type { CaptureSource, InboxKind } from "@/lib/constants";
import type { InboxExtras } from "@/server/db/schema";
import { normalizeText, truncate } from "@/lib/text";
import { AppError } from "@/server/context";
import { safeFetch } from "./safe-fetch";
import { extractHtml, normalizeWhitespace } from "./html";
import { extractFromFile, extractPdf, looksLikeEmail, parseEmail } from "./files";
import { extractJsonLdHints } from "./jsonld";

export const MAX_STORED_CHARS = 250_000;
export const MAX_AI_CHARS = 90_000;

export interface CaptureInput {
  text?: string | null;
  url?: string | null;
  file?: { buffer: Buffer; fileName: string; mimeType?: string | null } | null;
  sourceType?: CaptureSource;
  /** Optional title given by the client (e.g. browser extension page title). */
  title?: string | null;
}

export interface BuiltCapture {
  rawText: string;
  title: string | null;
  sourceType: CaptureSource;
  sourceUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  extras: InboxExtras;
  contentHash: string;
  kindHint: InboxKind;
}

const URL_ONLY = /^https?:\/\/\S+$/i;

function firstLine(text: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 3);
  return line ? truncate(line, 120) : null;
}

export function hashContent(text: string) {
  return createHash("sha256").update(normalizeText(text).slice(0, 30_000)).digest("hex");
}

/** Turns any user input (pasted text, URL, file) into plain text + metadata. Deterministic, no AI. */
export async function buildCapture(input: CaptureInput): Promise<BuiltCapture> {
  let text = (input.text ?? "").trim();
  let url = input.url?.trim() || null;
  if (!url && URL_ONLY.test(text)) {
    url = text;
    text = "";
  }
  const extras: InboxExtras = { warnings: [] };
  let title: string | null = input.title?.trim() || null;
  let sourceType: CaptureSource = input.sourceType ?? "PASTE";
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let kindHint: InboxKind = "UNKNOWN";

  if (input.file) {
    sourceType = input.sourceType ?? "FILE";
    fileName = input.file.fileName;
    mimeType = input.file.mimeType ?? null;
    const extracted = await extractFromFile(input.file.buffer, input.file.fileName, input.file.mimeType);
    text = [text, extracted.text].filter(Boolean).join("\n\n");
    title = title ?? extracted.title ?? input.file.fileName;
    extras.pageCount = extracted.pageCount ?? null;
    extras.warnings!.push(...extracted.warnings);
    if (extracted.email) {
      extras.email = extracted.email;
      kindHint = "EMAIL";
    }
    if (extracted.jsonLd?.length) extras.jsonLd = extracted.jsonLd;
  } else if (url && !text) {
    sourceType = input.sourceType ?? "URL";
    const resource = await safeFetch(url);
    extras.finalUrl = resource.finalUrl;
    if (resource.contentType === "application/pdf") {
      const pdf = await extractPdf(resource.body);
      text = pdf.text;
      extras.pageCount = pdf.pageCount ?? null;
      extras.warnings!.push(...pdf.warnings);
    } else if (resource.contentType.includes("html")) {
      const html = extractHtml(resource.body.toString("utf8"), resource.finalUrl);
      title = title ?? html.title;
      extras.pageTitle = html.title;
      extras.siteName = html.siteName;
      if (html.jsonLd.length) extras.jsonLd = html.jsonLd.slice(0, 10);
      const hints = extractJsonLdHints(html.jsonLd);
      // Many career sites render with JavaScript: the JSON-LD description is then the best text source.
      text = hints?.description && hints.description.length > html.text.length * 0.6 ? `${hints.title ?? ""}\n\n${hints.description}` : html.text;
      if (html.loginWall && !hints) {
        extras.warnings!.push("The page seems to require a login (login wall). Paste the text of the posting instead for a reliable import.");
      }
    } else {
      text = normalizeWhitespace(resource.body.toString("utf8"));
    }
  } else if (text && looksLikeEmail(text)) {
    const email = parseEmail(text);
    extras.email = email.email ?? null;
    title = title ?? email.title ?? null;
    kindHint = "EMAIL";
  }

  text = normalizeWhitespace(text);
  if (!text) {
    throw new AppError("VALIDATION", url ? "No readable text found on this page. Copy the text and paste it instead." : "Nothing to import: paste some text, a URL or a file.");
  }
  if (text.length > MAX_STORED_CHARS) {
    text = text.slice(0, MAX_STORED_CHARS);
    extras.truncated = true;
  }
  extras.charCount = text.length;
  return {
    rawText: text,
    title: title ?? firstLine(text),
    sourceType,
    sourceUrl: url,
    fileName,
    mimeType,
    extras,
    contentHash: hashContent(text),
    kindHint,
  };
}
