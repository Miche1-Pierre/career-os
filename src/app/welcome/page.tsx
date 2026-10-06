import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSettings } from "@/server/services/settings";
import { hasDemoData } from "@/server/services/demo";
import { libraryStatus } from "@/server/storage";
import { aiStatus } from "@/server/ai";
import { WelcomeWizard } from "@/components/app/welcome-wizard";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const [settings, library, ai, demo, sp] = await Promise.all([getSettings(), libraryStatus(), aiStatus({ fresh: true }), hasDemoData(), searchParams]);
  if (settings.onboarding.completedAt && !sp.again) redirect("/today");
  return (
    <WelcomeWizard
      userName={settings.general.userName}
      followUpDays={settings.followUp.defaultDays.JOB}
      businessDays={settings.followUp.businessDays}
      library={library}
      ai={{ available: ai.available, provider: ai.provider, detail: ai.detail, setup: ai.setup }}
      hasDemo={demo}
    />
  );
}
