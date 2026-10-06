import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/server/services/settings";
import { listStages } from "@/server/services/stages";
import { listTags } from "@/server/services/tags";
import { listViews } from "@/server/services/views";
import { listGoals } from "@/server/services/analytics";
import { listBackups } from "@/server/services/data-transfer";
import { hasDemoData } from "@/server/services/demo";
import { aiStatus } from "@/server/ai";
import { PROMPT_VERSIONS } from "@/server/ai/prompts";
import { libraryStatus, storageConfig } from "@/server/storage";
import { accessToken } from "@/server/security";
import { appUrl } from "@/server/mcp/tools";
import { SettingsShell, SETTINGS_NAV } from "@/components/settings/settings-shell";
import { GeneralSettings, AppearanceSettings, ProfileSettings, FollowUpSettings } from "@/components/settings/basic-settings";
import { PipelineSettings, TagSettings, ViewSettings } from "@/components/settings/pipeline-settings";
import { TemplateSettings, EmailTemplateSettings, AutomationSettings, GoalSettings } from "@/components/settings/workflow-settings";
import { AiSettings, DocumentsSettings, DataSettings, IntegrationSettings } from "@/components/settings/system-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SETTINGS_NAV.some((n) => n.key === section)) notFound();
  const settings = await getSettings();
  const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

  let content: React.ReactNode = null;
  switch (section) {
    case "general":
      content = <GeneralSettings value={settings.general} />;
      break;
    case "profile":
      content = <ProfileSettings value={settings.profile} />;
      break;
    case "follow-ups":
      content = <FollowUpSettings value={settings.followUp} />;
      break;
    case "pipelines":
      content = <PipelineSettings stages={json(await listStages(undefined, { includeArchived: true }))} />;
      break;
    case "tags":
      content = <TagSettings tags={json(await listTags())} />;
      break;
    case "views":
      content = <ViewSettings views={json(await listViews())} />;
      break;
    case "templates":
      content = <TemplateSettings value={settings.templates} />;
      break;
    case "emails":
      content = <EmailTemplateSettings value={settings.emailTemplates} />;
      break;
    case "automation":
      content = <AutomationSettings value={settings.automation} />;
      break;
    case "goals":
      content = <GoalSettings goals={json(await listGoals())} />;
      break;
    case "ai":
      content = <AiSettings value={settings.ai} status={json(await aiStatus({ fresh: true }))} prompts={Object.values(PROMPT_VERSIONS)} appUrl={appUrl()} />;
      break;
    case "documents":
      content = <DocumentsSettings library={await libraryStatus()} dataDir={storageConfig.dataDir} maxUploadMb={Math.round(storageConfig.maxUploadBytes / 1048576)} />;
      break;
    case "data":
      content = <DataSettings backups={json(await listBackups())} hasDemo={await hasDemoData()} backupsDir={storageConfig.backupsDir} />;
      break;
    case "integrations":
      content = <IntegrationSettings appUrl={appUrl()} protectedByToken={!!accessToken()} />;
      break;
    case "appearance":
      content = <AppearanceSettings />;
      break;
  }
  return <SettingsShell section={section}>{content}</SettingsShell>;
}
