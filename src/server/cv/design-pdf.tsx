/**
 * PDF of a free-form CV design (the Canva-like editor): every element at its position in points, real text (an ATS
 * reads it), the same fonts as the editor (Gelasio file, Helvetica and Times built into PDF readers).
 */
import { Document, Link, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { PAGE_H, PAGE_W, paragraphs, type CvDesign, type DesignElement, type FontKey, type Run, type TextElement } from "@/lib/cv-design";
import { registerFonts } from "./template";

const FAMILY: Record<FontKey, string> = { gelasio: "Gelasio", helvetica: "Helvetica", times: "Times-Roman" };
const MARKER_W = 8;

function runsOf(runs: Run[]) {
  return runs.map((r, i) => {
    const style: Style = {};
    if (r.bold) style.fontWeight = 700;
    if (r.italic) style.fontStyle = "italic";
    if (r.href)
      return (
        <Link key={i} src={r.href} style={{ ...style, textDecoration: "none" }}>
          {r.text}
        </Link>
      );
    return r.bold || r.italic ? (
      <Text key={i} style={style}>
        {r.text}
      </Text>
    ) : (
      r.text
    );
  });
}

function TextBox({ el }: { el: TextElement }) {
  const st = el.style;
  const base: Style = {
    fontFamily: FAMILY[st.font],
    fontSize: st.size,
    lineHeight: st.lineHeight,
    color: st.color,
    textAlign: st.align,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? "italic" : "normal",
    ...(st.letterSpacing ? { letterSpacing: st.letterSpacing } : {}),
    ...(st.uppercase ? { textTransform: "uppercase" } : {}),
  };
  const paras = paragraphs(el.text);
  return (
    <View style={{ position: "absolute", left: el.x, top: el.y, width: el.w }}>
      {paras.map((runs, i) => {
        const empty = runs.every((r) => !r.text);
        const spacing = i < paras.length - 1 ? st.paraSpacing : 0;
        if (el.list !== "none")
          return (
            <View key={i} style={{ flexDirection: "row", marginBottom: spacing }}>
              <Text style={{ ...base, width: MARKER_W, textAlign: "left" }}>{el.list === "dash" ? "-" : "•"}</Text>
              <Text style={{ ...base, flex: 1 }}>{empty ? " " : runsOf(runs)}</Text>
            </View>
          );
        return (
          <Text key={i} style={{ ...base, marginBottom: spacing }}>
            {empty ? " " : runsOf(runs)}
          </Text>
        );
      })}
    </View>
  );
}

function Element({ el }: { el: DesignElement }) {
  if (el.type === "text") return <TextBox el={el} />;
  if (el.type === "line") return <View style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, backgroundColor: el.color }} />;
  return (
    <View
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        borderRadius: el.radius,
        ...(el.fill ? { backgroundColor: el.fill } : {}),
        ...(el.stroke && el.strokeWidth ? { borderWidth: el.strokeWidth, borderColor: el.stroke, borderStyle: "solid" } : {}),
      }}
    />
  );
}

export async function renderDesignPdf(design: CvDesign, meta: { title: string; author: string }): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(
    <Document title={meta.title} author={meta.author} creator="Career OS" producer="Career OS">
      {design.pages.map((pg) => (
        // No ligatures: "fi" / "fl" glyphs make ATS text extraction read "fables" instead of "fiables".
        <Page key={pg.id} size={[PAGE_W, PAGE_H]} style={{ position: "relative", fontFeatureSettings: { liga: false, clig: false } }}>
          {pg.elements.map((el) => (
            <Element key={el.id} el={el} />
          ))}
        </Page>
      ))}
    </Document>,
  );
}
