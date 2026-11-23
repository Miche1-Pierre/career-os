/**
 * PDF template "classic": reproduces Pierre's current CVs (serif, "| SECTION" headings with a rule, bold italic entry
 * titles with right-aligned dates, dash bullets). Rendered by @react-pdf/renderer, without AI: same content, same PDF.
 *
 * Font: Gelasio (SIL Open Font License), metric-compatible with Georgia used by the original CVs.
 */
import path from "node:path";
import { Document, Font, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { boldRuns, splitRole, type CvBlock, type CvEntryView, type CvHeader, type CvStyle } from "@/lib/cv";

const FONT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts", "gelasio");

const g = globalThis as unknown as { __careerOsCvFonts?: boolean };
function registerFonts() {
  if (g.__careerOsCvFonts) return;
  g.__careerOsCvFonts = true;
  Font.register({
    family: "Gelasio",
    fonts: [
      { src: path.join(FONT_DIR, "gelasio-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "gelasio-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(FONT_DIR, "gelasio-latin-700-normal.woff"), fontWeight: 700 },
      { src: path.join(FONT_DIR, "gelasio-latin-700-italic.woff"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  // No automatic hyphenation (the original CVs break lines between words).
  Font.registerHyphenationCallback((word) => [word]);
}

const INK = "#111111";
const MUTED = "#444444";
const LINK = "#1a4fd6";
const RULE = "#9a9a9a";

const s = StyleSheet.create({
  // No ligatures: "fi" / "fl" glyphs make ATS text extraction read "fables" instead of "fiables".
  page: { fontFamily: "Gelasio", fontSize: 9.3, color: INK, paddingTop: 30, paddingBottom: 30, paddingHorizontal: 44, lineHeight: 1.28, fontFeatureSettings: { liga: false, clig: false } },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  name: { fontSize: 16.5, fontWeight: 700, lineHeight: 1.1 },
  headerLine: { fontSize: 8.8, color: MUTED },
  title: { fontSize: 11, fontWeight: 700, fontStyle: "italic", textAlign: "right" },
  link: { fontSize: 8.8, color: LINK, textDecoration: "none", textAlign: "right" },
  section: { marginTop: 7 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 0.6, borderBottomColor: RULE, paddingBottom: 1.5, marginBottom: 3.5 },
  sectionTitle: { fontSize: 11, fontWeight: 700 },
  aside: { fontSize: 9, fontStyle: "italic", color: MUTED },
  paragraph: { textAlign: "justify" },
  entry: { marginBottom: 3.5 },
  entryHead: { flexDirection: "row", justifyContent: "space-between" },
  entryTitle: { fontWeight: 700, fontStyle: "italic", flexShrink: 1, paddingRight: 8 },
  dates: { color: MUTED, flexShrink: 0 },
  role: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  subtitle: { fontStyle: "italic", color: MUTED, fontSize: 8.8 },
  bullet: { flexDirection: "row", paddingLeft: 4 },
  dash: { width: 8 },
  bulletText: { flex: 1, textAlign: "justify" },
  skill: { textAlign: "justify", marginBottom: 1 },
  bold: { fontWeight: 700 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridCell: { width: "48.5%", marginBottom: 3 },
});

/** Text with "**bold**" parts. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {boldRuns(text).map((r, i) =>
        r.bold ? (
          <Text key={i} style={s.bold}>
            {r.text}
          </Text>
        ) : (
          r.text
        ),
      )}
    </>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((b, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.dash}>-</Text>
          <Text style={s.bulletText}>
            <Rich text={b} />
          </Text>
        </View>
      ))}
    </>
  );
}

function href(link: string) {
  return /^https?:\/\//i.test(link) ? link : /@/.test(link) ? `mailto:${link}` : `https://${link}`;
}

function Entry({ e, style }: { e: CvEntryView; style: CvStyle }) {
  const [role, rest] = splitRole(e.title);
  return (
    <View style={s.entry} wrap={false}>
      <View style={s.entryHead}>
        {style.titleStyle === "ROLE_BOLD" ? (
          <Text style={{ flexShrink: 1, paddingRight: 8 }}>
            <Text style={s.role}>{role}</Text>
            {rest}
          </Text>
        ) : (
          <Text style={s.entryTitle}>{e.title}</Text>
        )}
        {e.dates ? <Text style={s.dates}>{e.dates}</Text> : null}
      </View>
      {e.subtitle ? <Text style={s.subtitle}>{e.subtitle}</Text> : null}
      <Bullets items={e.bullets} />
    </View>
  );
}

function Block({ block, entries, style, first }: { block: CvBlock; entries: Map<string, CvEntryView>; style: CvStyle; first: boolean }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead} wrap={false}>
        <Text style={s.sectionTitle}>| {block.title}</Text>
        {block.aside ? <Text style={s.aside}>{block.aside}</Text> : null}
      </View>
      {block.kind === "TEXT" && block.text ? (
        <Text style={first && style.summaryItalic ? [s.paragraph, s.italic] : s.paragraph}>
          <Rich text={block.text} />
        </Text>
      ) : null}
      {block.kind === "BULLETS" ? <Bullets items={block.bullets} /> : null}
      {block.kind === "SKILLS" && block.columns === 2 ? (
        <View style={s.grid}>
          {block.lines.map((l, i) => (
            <View key={i} style={s.gridCell}>
              <Text style={s.bold}>{l.label}</Text>
              <Text>{l.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {block.kind === "SKILLS" && block.columns !== 2
        ? block.lines.map((l, i) => (
            <Text key={i} style={s.skill}>
              <Text style={s.bold}>{l.label}: </Text>
              {l.text}
            </Text>
          ))
        : null}
      {block.kind === "ENTRIES"
        ? block.entries.map((id) => {
            const e = entries.get(id);
            return e ? <Entry key={id} e={e} style={style} /> : null;
          })
        : null}
    </View>
  );
}

export function CvDocument({ header, sections, entries, title, style }: { header: CvHeader; sections: CvBlock[]; entries: Map<string, CvEntryView>; title: string; style: CvStyle }) {
  const firstText = sections.findIndex((b) => b.kind === "TEXT" && !!b.text);
  return (
    <Document title={title} author={header.name} creator="Career OS" producer="Career OS">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.name}>{header.name}</Text>
            {header.lines.map((l, i) => (
              <Text key={i} style={s.headerLine}>
                {l}
              </Text>
            ))}
          </View>
          <View style={{ alignItems: "flex-end", maxWidth: "62%" }}>
            {header.title ? <Text style={s.title}>{header.title}</Text> : null}
            {header.links.map((l, i) => (
              <Link key={i} src={href(l)} style={s.link}>
                {l}
              </Link>
            ))}
          </View>
        </View>
        {sections.map((b, i) => (
          <Block key={i} block={b} entries={entries} style={style} first={i === firstText} />
        ))}
      </Page>
    </Document>
  );
}

/** PDF of a CV variant (deterministic for the same content). */
export async function renderCvPdf(input: { header: CvHeader; sections: CvBlock[]; entries: CvEntryView[]; title: string; style?: CvStyle }): Promise<Buffer> {
  registerFonts();
  const map = new Map(input.entries.map((e) => [e.id, e]));
  const style: CvStyle = input.style ?? { titleStyle: "BOLD_ITALIC", summaryItalic: false };
  return renderToBuffer(<CvDocument header={input.header} sections={input.sections} entries={map} title={input.title} style={style} />);
}
