import { formatISODate, todayISO } from "@/lib/dates";
import { firstName, renderTemplate } from "@/lib/text";
import { getOpportunity } from "./opportunities";
import { getSettings } from "./settings";

/** Fills an email template for an opportunity (deterministic, no AI). The user sends it themselves. */
export async function renderEmailTemplate(opportunityId: string, templateId?: string | null) {
  const [opp, settings] = await Promise.all([getOpportunity(opportunityId), getSettings()]);
  const templates = settings.emailTemplates;
  const education = ["FORMATION", "PHD", "PROGRAM"].includes(opp.type);
  const template =
    templates.find((t) => t.id === templateId) ??
    (education ? templates.find((t) => t.id === "program-follow-up-fr") : null) ??
    templates.find((t) => t.purpose === "FOLLOW_UP") ??
    templates[0];
  const contact = opp.contacts.find((c) => c.relationship === "RECRUITER" || c.relationship === "ADMISSIONS") ?? opp.contacts[0] ?? null;
  const locale = template?.language === "fr" ? "fr-FR" : "en-GB";
  const vars = {
    title: opp.title,
    organization: opp.organization?.name ?? "",
    contactFirstName: firstName(contact?.fullName) || (template?.language === "fr" ? "Madame, Monsieur" : "there"),
    contactName: contact?.fullName ?? "",
    appliedDate: opp.appliedAt ? formatISODate(opp.appliedAt, "long", locale) : "",
    userName: settings.general.userName || settings.profile.fullName || "",
    today: formatISODate(todayISO(settings.general.timezone), "long", locale),
  };
  return {
    templates: templates.map((t) => ({ id: t.id, name: t.name, language: t.language, purpose: t.purpose })),
    templateId: template?.id ?? null,
    to: contact?.email ?? null,
    contactName: contact?.fullName ?? null,
    subject: template ? renderTemplate(template.subject, vars) : "",
    body: template ? renderTemplate(template.body, vars) : "",
  };
}
