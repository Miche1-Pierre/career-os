"use client";

/**
 * HTML drawing of a CV design, shared by the editor and the thumbnails. 1 CSS px = 1 PDF point inside the page,
 * then the page is scaled: line breaks do not depend on the zoom and match the PDF (same fonts and metrics).
 */
import { FONT_CSS, PAGE_H, PAGE_W, paragraphs, type DesignElement, type DesignPage, type Measure, type Run, type TextElement } from "@/lib/cv-design";

export function textCss(el: TextElement): React.CSSProperties {
  const st = el.style;
  return {
    fontFamily: FONT_CSS[st.font],
    fontSize: `${st.size}px`,
    lineHeight: st.lineHeight,
    color: st.color,
    textAlign: st.align,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? "italic" : "normal",
    letterSpacing: st.letterSpacing ? `${st.letterSpacing}px` : undefined,
    textTransform: st.uppercase ? "uppercase" : undefined,
  };
}

function RunsView({ runs }: { runs: Run[] }) {
  if (runs.every((r) => !r.text)) return <>{" "}</>;
  return (
    <>
      {runs.map((r, i) => {
        const style: React.CSSProperties = {};
        if (r.bold) style.fontWeight = 700;
        if (r.italic) style.fontStyle = "italic";
        // Links are spans on screen (the page sits inside clickable cards); they are real links in the PDF.
        if (r.href)
          return (
            <span key={i} style={style} data-href={r.href} title={r.href}>
              {r.text}
            </span>
          );
        if (r.bold && r.italic)
          return (
            <strong key={i}>
              <em>{r.text}</em>
            </strong>
          );
        if (r.bold) return <strong key={i}>{r.text}</strong>;
        if (r.italic) return <em key={i}>{r.text}</em>;
        return <span key={i}>{r.text}</span>;
      })}
    </>
  );
}

/** Class of a paragraph: list rows hang their marker (drawn in CSS, like the PDF's 8 pt marker column). */
export function paragraphClass(el: TextElement) {
  return el.list === "none" ? undefined : el.list === "dash" ? "cv-li" : "cv-li cv-li-bullet";
}

/** The inside of a text box (one block per paragraph). */
export function TextContent({ el }: { el: TextElement }) {
  const paras = paragraphs(el.text);
  const cls = paragraphClass(el);
  return (
    <>
      {paras.map((runs, i) => (
        <div key={i} className={cls} style={i < paras.length - 1 && el.style.paraSpacing ? { marginBottom: `${el.style.paraSpacing}px` } : undefined}>
          <RunsView runs={runs} />
        </div>
      ))}
    </>
  );
}

/** One element, absolutely positioned in its page (no interaction). */
export function ElementView({ el }: { el: DesignElement }) {
  if (el.type === "text")
    return (
      <div className="cv-text" style={{ position: "absolute", left: el.x, top: el.y, width: el.w, ...textCss(el) }}>
        <TextContent el={el} />
      </div>
    );
  if (el.type === "line") return <div style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, background: el.color }} />;
  return (
    <div
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        background: el.fill ?? "transparent",
        borderRadius: el.radius,
        border: el.stroke && el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : undefined,
      }}
    />
  );
}

/** A read-only page at a given width (thumbnails, previews). */
export function PageThumb({ page, width }: { page: DesignPage; width: number }) {
  const scale = width / PAGE_W;
  return (
    <div className="relative overflow-hidden bg-white" style={{ width, height: PAGE_H * scale }}>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}>
        {page.elements.map((el) => (
          <ElementView key={el.id} el={el} />
        ))}
      </div>
    </div>
  );
}

/**
 * Text heights measured by the browser in a hidden box (same CSS as the editor), for laying out a CV that has
 * never been opened in the editor. Built with DOM nodes (never innerHTML).
 */
export function createDomMeasure(): { measure: Measure; dispose: () => void } {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "absolute", left: "-10000px", top: "0", visibility: "hidden", pointerEvents: "none" });
  document.body.appendChild(host);
  const measure: Measure = (el) => {
    const box = document.createElement("div");
    box.className = "cv-text";
    const css = textCss(el);
    Object.assign(box.style, {
      width: `${el.w}px`,
      fontFamily: css.fontFamily,
      fontSize: css.fontSize,
      lineHeight: String(css.lineHeight),
      textAlign: css.textAlign,
      fontWeight: String(css.fontWeight),
      fontStyle: css.fontStyle,
      letterSpacing: css.letterSpacing ?? "",
      textTransform: css.textTransform ?? "",
    });
    fillTextBox(box, el);
    host.appendChild(box);
    const h = box.getBoundingClientRect().height;
    host.removeChild(box);
    return h;
  };
  return { measure, dispose: () => host.remove() };
}

/**
 * Fills a box with the paragraphs of a text element as DOM nodes (bold, italic, links), never through innerHTML:
 * used to measure and as the starting content of the inline text editor.
 */
export function fillTextBox(box: HTMLElement, el: TextElement) {
  box.replaceChildren();
  const paras = paragraphs(el.text);
  const cls = paragraphClass(el);
  paras.forEach((runs, i) => {
    const p = document.createElement("div");
    if (cls) p.className = cls;
    if (i < paras.length - 1 && el.style.paraSpacing) p.style.marginBottom = `${el.style.paraSpacing}px`;
    if (runs.every((r) => !r.text)) p.appendChild(document.createElement("br"));
    for (const r of runs) {
      if (!r.text) continue;
      let node: HTMLElement;
      if (r.href) {
        node = document.createElement("span");
        node.setAttribute("data-href", r.href);
      } else node = document.createElement(r.bold ? "strong" : r.italic ? "em" : "span");
      if (r.href && r.bold) node.style.fontWeight = "700";
      if (r.href && r.italic) node.style.fontStyle = "italic";
      node.textContent = r.text;
      p.appendChild(node);
    }
    box.appendChild(p);
  });
}

/** Waits for the CV fonts (Gelasio) so that measurements are right. */
export async function loadCvFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(["400 normal", "400 italic", "700 normal", "700 italic"].map((v) => document.fonts.load(`${v.split(" ")[1] === "italic" ? "italic " : ""}${v.split(" ")[0]} 10px Gelasio`).catch(() => [])));
}
