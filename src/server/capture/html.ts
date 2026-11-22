import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface HtmlExtraction {
  title: string | null;
  siteName: string | null;
  description: string | null;
  text: string;
  jsonLd: unknown[];
  loginWall: boolean;
}

const LOGIN_WALL_HINTS = [/sign in to (view|see)/i, /join linkedin/i, /connectez-vous pour/i, /authwall/i, /please enable javascript/i, /captcha/i];

function collectJsonLd(document: Document): unknown[] {
  const out: unknown[] = [];
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ? parsed["@graph"] : [parsed];
      for (const item of items) if (item && typeof item === "object") out.push(item);
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return out;
}

function meta(document: Document, names: string[]): string | null {
  for (const name of names) {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

/** Converts HTML into readable text (Readability, then a structural fallback), keeping JSON-LD blocks. */
export function extractHtml(html: string, url?: string): HtmlExtraction {
  const { document } = parseHTML(html);
  const jsonLd = collectJsonLd(document as unknown as Document);
  const title = meta(document as unknown as Document, ["og:title", "twitter:title"]) ?? document.title?.trim() ?? null;
  const siteName = meta(document as unknown as Document, ["og:site_name", "application-name"]);
  const description = meta(document as unknown as Document, ["og:description", "description", "twitter:description"]);

  let text = "";
  try {
    const clone = parseHTML(html).document;
    const article = new Readability(clone as unknown as Document, { charThreshold: 200, keepClasses: false }).parse();
    if (article?.textContent) text = article.textContent;
  } catch {
    // fall back below
  }
  if (text.replace(/\s+/g, " ").trim().length < 400) {
    for (const el of Array.from(document.querySelectorAll("script, style, noscript, svg, iframe, nav, footer, header, form"))) el.remove();
    // Block-level elements become new lines.
    for (const el of Array.from(document.querySelectorAll("br, p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article"))) {
      el.insertAdjacentText("beforebegin", "\n");
    }
    text = document.body?.textContent ?? "";
  }
  text = normalizeWhitespace(text);
  const loginWall = text.length < 800 && LOGIN_WALL_HINTS.some((re) => re.test(html.slice(0, 200_000)));
  void url;
  return { title, siteName, description, text, jsonLd, loginWall };
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Plain text of an HTML fragment (JSON-LD descriptions often contain HTML). */
export function htmlToText(fragment: string): string {
  if (!/[<&]/.test(fragment)) return fragment.trim();
  const { document } = parseHTML(`<!doctype html><html><body>${fragment}</body></html>`);
  for (const el of Array.from(document.querySelectorAll("br, p, div, li, h1, h2, h3, h4, tr"))) el.insertAdjacentText("beforebegin", "\n");
  for (const li of Array.from(document.querySelectorAll("li"))) li.insertAdjacentText("afterbegin", "• ");
  return normalizeWhitespace(document.body?.textContent ?? "");
}
