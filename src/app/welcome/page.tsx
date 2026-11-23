import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSettings } from "@/server/services/settings";
import { hasDemoData } from "@/server/services/demo";
import { ensureLibraryFolders, libraryStatus } from "@/server/storage";
import { aiStatus } from "@/server/ai";
import { DOCUMENT_KIND_META } from "@/lib/constants";
import { WelcomeWizard } from "@/components/app/welcome-wizard";

export const metadata: Metadata = { title: "Bienvenue" };
export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  if (settings.onboarding.completedAt && !sp.again) redirect("/");
  // The documents folder (and its usual sub-folders) is created when missing: nothing for the user to do.
  const kinds = Object.values(DOCUMENT_KIND_META);
  await ensureLibraryFolders([...new Set(kinds.map((k) => k.folder))]);
  const [library, ai, demo] = await Promise.all([libraryStatus(), aiStatus({ fresh: true }), hasDemoData()]);
  const labels = [...new Map(kinds.map((k) => [k.folder, k.plural])).values()];
  const [first, ...rest] = (settings.profile.fullName || "").split(/\s+/).filter(Boolean);
  return (
    <WelcomeWizard
      firstName={settings.general.userName || first || ""}
      lastName={rest.join(" ")}
      email={settings.profile.email}
      phone={settings.profile.phone}
      location={settings.profile.location}
      followUpDays={settings.followUp.defaultDays.JOB}
      businessDays={settings.followUp.businessDays}
      library={{ hostRoot: library.hostRoot, exists: library.exists, writable: library.writable, folders: labels }}
      ai={{ available: ai.available, apiKey: ai.apiKey ?? null, detail: ai.detail, install: ai.install ?? null }}
      hasDemo={demo}
    />
  );
}
