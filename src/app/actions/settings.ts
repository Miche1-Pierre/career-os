"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, USER } from "@/server/context";
import { runAction } from "@/server/action-utils";
import type { SettingsSection } from "@/lib/settings-schema";
import type { StageCategory, PipelineKey } from "@/lib/constants";
import type { SavedViewFilters } from "@/server/db/schema";
import { getSettings, patchSettingsSection, updateSettingsSection } from "@/server/services/settings";
import * as stages from "@/server/services/stages";
import * as tags from "@/server/services/tags";
import * as views from "@/server/services/views";
import * as analytics from "@/server/services/analytics";
import * as demo from "@/server/services/demo";
import * as notif from "@/server/services/notifications";
import * as data from "@/server/services/data-transfer";
import { changeStatus } from "@/server/services/opportunities";
import { evaluatePeriodicRules } from "@/server/services/rules";
import { aiStatus } from "@/server/ai";
import { accessToken, safeEqual, SESSION_COOKIE, sessionValue } from "@/server/security";

export async function updateSettingsAction(section: SettingsSection, value: unknown) {
  return runAction(async () => {
    await updateSettingsSection(section, value, USER);
    return null;
  });
}

export async function patchSettingsAction(section: SettingsSection, patch: Record<string, unknown>) {
  return runAction(async () => {
    await patchSettingsSection(section, patch as never, USER);
    return null;
  });
}

export async function completeOnboardingAction(options: { loadDemo?: boolean; userName?: string; followUpDays?: number; businessDays?: boolean } = {}) {
  const result = await runAction(async () => {
    const settings = await getSettings();
    if (options.userName !== undefined) await patchSettingsSection("general", { userName: options.userName }, USER);
    if (options.followUpDays !== undefined || options.businessDays !== undefined) {
      const days = options.followUpDays ?? settings.followUp.defaultDays.JOB;
      await patchSettingsSection(
        "followUp",
        {
          businessDays: options.businessDays ?? settings.followUp.businessDays,
          defaultDays: { ...settings.followUp.defaultDays, JOB: days, INTERNSHIP: days, ALTERNANCE: days, VIE: days, OTHER: days },
        },
        USER,
      );
    }
    if (options.loadDemo && !(await demo.hasDemoData())) await demo.seedDemoData(USER);
    const onboarding = (await getSettings()).onboarding;
    await updateSettingsSection("onboarding", { ...onboarding, completedAt: new Date().toISOString() }, USER);
    return null;
  });
  if (result.ok) redirect("/today");
  return result;
}

export async function seedDemoAction() {
  return runAction(() => demo.seedDemoData(USER));
}

export async function deleteDemoAction() {
  return runAction(() => demo.deleteDemoData(USER));
}

export async function testAiAction() {
  return runAction(() => aiStatus({ fresh: true }), { revalidate: false });
}

export async function runRulesAction() {
  return runAction(() => evaluatePeriodicRules());
}

// Stages
export async function createStageAction(input: { pipeline: PipelineKey; key: string; label: string; category: StageCategory }) {
  return runAction(async () => ({ id: (await stages.createStage(input, USER)).id }));
}
export async function updateStageAction(id: string, patch: { label?: string; category?: StageCategory; color?: string | null; isArchived?: boolean; isDefault?: boolean }) {
  return runAction(async () => ({ id: (await stages.updateStage(id, patch, USER)).id }));
}
export async function reorderStagesAction(pipeline: PipelineKey, ids: string[]) {
  return runAction(async () => {
    await stages.reorderStages(pipeline, ids, USER);
    return null;
  });
}
export async function deleteStageAction(id: string) {
  return runAction(async () => {
    await stages.deleteStage(id, USER);
    return null;
  });
}

// Tags
export async function renameTagAction(oldName: string, newName: string) {
  return runAction(async () => {
    await tags.renameTag(oldName, newName, USER);
    return null;
  });
}
export async function setTagColorAction(name: string, color: string) {
  return runAction(async () => {
    await tags.updateTag(name, { color });
    return null;
  });
}
export async function deleteTagAction(name: string) {
  return runAction(async () => {
    await tags.deleteTag(name, USER);
    return null;
  });
}

// Saved views
export async function createViewAction(name: string, filters: SavedViewFilters) {
  return runAction(async () => ({ id: (await views.createView({ name, filters }, USER)).id }));
}
export async function updateViewAction(id: string, input: { name?: string; filters?: SavedViewFilters }) {
  return runAction(async () => ({ id: (await views.updateView(id, input, USER)).id }));
}
export async function deleteViewAction(id: string) {
  return runAction(async () => {
    await views.deleteView(id, USER);
    return null;
  });
}

// Goals
export async function createGoalAction(input: Parameters<typeof analytics.createGoal>[0]) {
  return runAction(async () => ({ id: (await analytics.createGoal(input, USER)).id }));
}
export async function updateGoalAction(id: string, input: Parameters<typeof analytics.updateGoal>[1]) {
  return runAction(async () => ({ id: (await analytics.updateGoal(id, input, USER)).id }));
}
export async function deleteGoalAction(id: string) {
  return runAction(async () => {
    await analytics.deleteGoal(id, USER);
    return null;
  });
}

// Notifications
export async function dismissNotificationAction(id: string) {
  return runAction(async () => {
    await notif.dismissNotification(id);
    return null;
  });
}
export async function runNotificationAction(id: string, action: { type: string; payload?: Record<string, unknown> }) {
  return runAction(async () => {
    if (action.type === "SET_STATUS") {
      const { opportunityId, status } = (action.payload ?? {}) as { opportunityId?: string; status?: string };
      if (!opportunityId || !status) throw new AppError("VALIDATION", "Invalid action");
      await changeStatus(opportunityId, { status }, USER);
    }
    await notif.dismissNotification(id);
    return null;
  });
}

// Backups & import
export async function createBackupAction() {
  return runAction(() => data.createBackup("manual"));
}
export async function restoreBackupAction(name: string) {
  return runAction(() => data.restoreBackup(name, USER));
}
export async function importDataAction(formData: FormData) {
  return runAction(async () => {
    const file = formData.get("file");
    const mode = formData.get("mode") === "merge" ? "merge" : "replace";
    if (!file || typeof file === "string") throw new AppError("VALIDATION", "Choose a file");
    const f = file as File;
    const buffer = new Uint8Array(await f.arrayBuffer());
    await data.createBackup("pre-restore");
    if (f.name.toLowerCase().endsWith(".zip")) return (await data.importZip(buffer, mode, USER)).counts;
    if (f.name.toLowerCase().endsWith(".gz")) {
      const { gunzipSync, strFromU8 } = await import("fflate");
      return data.importAll(JSON.parse(strFromU8(gunzipSync(buffer))), mode, USER);
    }
    return data.importAll(JSON.parse(new TextDecoder().decode(buffer)), mode, USER);
  });
}

// Access token (VPS mode)
export async function unlockAction(_: unknown, formData: FormData) {
  const token = accessToken();
  const given = String(formData.get("token") ?? "");
  const next = String(formData.get("next") ?? "/today");
  if (!token) redirect("/today");
  if (!safeEqual(given, token)) {
    await new Promise((resolve) => setTimeout(resolve, 750)); // slows down guessing
    return { error: "Invalid access token" };
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionValue(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/today");
}
