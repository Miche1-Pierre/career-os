/**
 * Versioned procedure templates by country pair (official sources cited, `checkedAt` = date of the last check).
 * Server-side only (the JSON is not needed in the browser): pages pass the list of available templates.
 */
import { procedureTemplateSchema, type ProcedureTemplate } from "@/lib/procedures";
import frGeneric from "./fr-generic.json";
import frCa from "./fr-ca.json";
import frBe from "./fr-be.json";
import frUs from "./fr-us.json";

const RAW: unknown[] = [frGeneric, frBe, frCa, frUs];

export const PROCEDURE_TEMPLATES: ProcedureTemplate[] = RAW.map((t) => procedureTemplateSchema.parse(t));

export function getTemplate(key: string): ProcedureTemplate | null {
  return PROCEDURE_TEMPLATES.find((t) => t.key === key) ?? null;
}
