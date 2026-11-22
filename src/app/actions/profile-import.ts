"use server";

import { AppError } from "@/server/context";
import { runAction } from "@/server/action-utils";
import { importProfileFromCv } from "@/server/services/profile-import";

/** Reads a CV (PDF/DOCX) and returns proposed profile values for review. Saves nothing. */
export async function importProfileFromCvAction(formData: FormData) {
  return runAction(
    async () => {
      const file = formData.get("file");
      if (!file || typeof file === "string") throw new AppError("VALIDATION", "Choisissez un fichier PDF ou DOCX.");
      const f = file as File;
      return importProfileFromCv(Buffer.from(await f.arrayBuffer()), f.name, f.type || null);
    },
    { revalidate: false },
  );
}
