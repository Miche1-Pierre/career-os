/**
 * Application kit (spec v2, P5): what goes with an application (CV version, letter, message), the channel and the
 * link. Stored in `opportunities.details.kit`. Pure and client-safe.
 */
import { z } from "zod";

export const KIT_CHANNELS = ["EMAIL", "LINKEDIN", "SITE", "INDEED", "HELLOWORK", "WTTJ", "FRANCE_TRAVAIL", "OTHER"] as const;
export type KitChannel = (typeof KIT_CHANNELS)[number];
export const KIT_CHANNEL_LABEL: Record<KitChannel, string> = {
  EMAIL: "Email direct",
  LINKEDIN: "LinkedIn",
  SITE: "Site de l’entreprise",
  INDEED: "Indeed",
  HELLOWORK: "HelloWork",
  WTTJ: "Welcome to the Jungle",
  FRANCE_TRAVAIL: "France Travail",
  OTHER: "Autre",
};

export const kitSchema = z.object({
  cvVersionId: z.string().uuid().nullable().optional(),
  letterVersionId: z.string().uuid().nullable().optional(),
  channel: z.enum(KIT_CHANNELS).nullable().optional(),
  applyUrl: z.string().trim().max(2048).regex(/^https?:\/\/\S+$/i, "Lien http(s) attendu").nullable().optional(),
  message: z.string().max(6000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type Kit = z.infer<typeof kitSchema>;

export function parseKit(details: unknown): Kit | null {
  const raw = (details as { kit?: unknown } | null | undefined)?.kit;
  if (!raw || typeof raw !== "object") return null;
  const parsed = kitSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What is still missing before sending (for the checklist line of the kit). Pure. */
export function kitMissing(kit: Kit | null | undefined): string[] {
  const out: string[] = [];
  if (!kit?.cvVersionId) out.push("CV");
  if (!kit?.channel) out.push("canal");
  if (kit?.channel && kit.channel !== "EMAIL" && kit.channel !== "LINKEDIN" && !kit.applyUrl) out.push("lien");
  return out;
}
