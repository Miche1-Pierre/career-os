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
import { aiStatus, invalidateAiStatus } from "@/server/ai";
import { removeAnthropicKey, saveAnthropicKey } from "@/server/ai/credentials";
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

export async function completeOnboardingAction(
  options: {
    loadDemo?: boolean;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    targetRoles?: string[];
    targetDomains?: string[];
    preferredLocations?: string[];
    followUpDays?: number;
    businessDays?: boolean;
  } = {},
) {
  const result = await runAction(async () => {
    const settings = await getSettings();
    if (options.firstName !== undefined) await patchSettingsSection("general", { userName: options.firstName }, USER);
    const fullName = [options.firstName, options.lastName].filter((x) => x && x.trim()).join(" ").trim();
    const profilePatch: Record<string, unknown> = {};
    if (fullName) profilePatch.fullName = fullName;
    for (const key of ["email", "phone", "location"] as const) if (options[key] !== undefined) profilePatch[key] = options[key];
    for (const key of ["targetRoles", "targetDomains", "preferredLocations"] as const) if (options[key]?.length) profilePatch[key] = options[key];
    if (Object.keys(profilePatch).length) await patchSettingsSection("profile", profilePatch as never, USER);
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
  if (result.ok) redirect("/");
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

/** Claude API key pasted in the app: checked with Anthropic, stored on this computer, used right away. */
export async function saveApiKeyAction(key: string) {
  return runAction(async () => {
    await saveAnthropicKey(String(key ?? ""));
    invalidateAiStatus();
    return aiStatus({ fresh: true });
  });
}

export async function removeApiKeyAction() {
  return runAction(async () => {
    removeAnthropicKey();
    invalidateAiStatus();
    return aiStatus({ fresh: true });
  });
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
      if (!opportunityId || !status) throw new AppError("VALIDATION", "Action invalide");
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
    if (!file || typeof file === "string") throw new AppError("VALIDATION", "Choisissez un fichier");
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
    return { error: "Jeton d’accès invalide" };
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

/** Brand icons of skills typed in the profile editor (looked up server-side, see server/skill-icons). */
export async function skillIconsAction(skills: string[]) {
  return runAction(async () => {
    const { skillIcons } = await import("@/server/skill-icons");
    return skillIcons(skills.slice(0, 300).map((s) => String(s).slice(0, 200)));
  }, { revalidate: false });
}
