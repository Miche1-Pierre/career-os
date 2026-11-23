import type { Metadata } from "next";
import { z } from "zod";
import { listCvCards, listEntries } from "@/server/services/cv";
import { cvBlockSchema, cvHeaderSchema, cvStyleSchema } from "@/lib/cv";
import { cvDesignSchema } from "@/lib/cv-design";
import { CvList } from "@/components/cv/cv-list";

export const metadata: Metadata = { title: "CV" };

export default async function CvPage() {
  const [cards, entries] = await Promise.all([listCvCards(), listEntries()]);
  return (
    <CvList
      entries={entries}
      cards={cards.map((c) => {
        const design = c.design ? cvDesignSchema.safeParse(c.design) : null;
        return {
          id: c.id,
          name: c.name,
          lang: c.lang,
          design: design?.success ? design.data : null,
          header: cvHeaderSchema.parse(c.header),
          sections: z.array(cvBlockSchema).catch([]).parse(c.sections),
          style: cvStyleSchema.parse(c.style ?? {}),
          documentId: c.documentId,
          updatedAt: new Date(c.updatedAt).toISOString(),
          versions: c.versions.map((v) => ({ id: v.id, version: v.version, fileName: v.fileName, createdAt: new Date(v.createdAt).toISOString() })),
        };
      })}
    />
  );
}
