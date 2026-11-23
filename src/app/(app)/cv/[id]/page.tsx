import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getVariant, listEntries } from "@/server/services/cv";
import { opportunityOptions } from "@/server/services/opportunities";
import { AppError } from "@/server/context";
import { cvBlockSchema, cvHeaderSchema, cvStyleSchema } from "@/lib/cv";
import { cvDesignSchema } from "@/lib/cv-design";
import { CvEditorLoader } from "@/components/cv/cv-editor-loader";

async function load(id: string) {
  try {
    return await getVariant(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: (await load(id)).name };
}

/** Full-screen CV editor (Canva-like). */
export default async function CvEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, entries, opps] = await Promise.all([load(id), listEntries(), opportunityOptions({ limit: 300 })]);
  const design = v.design ? cvDesignSchema.safeParse(v.design) : null;
  return (
    <CvEditorLoader
      variant={{
        id: v.id,
        name: v.name,
        lang: v.lang,
        design: design?.success ? design.data : null,
        header: cvHeaderSchema.parse(v.header),
        sections: z.array(cvBlockSchema).catch([]).parse(v.sections),
        style: cvStyleSchema.parse(v.style ?? {}),
      }}
      entries={entries}
      opportunities={opps.map((o) => ({ id: o.id, label: o.organizationName ? `${o.organizationName} · ${o.title}` : o.title }))}
    />
  );
}
