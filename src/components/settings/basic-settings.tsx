"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, ListEditor, NumberInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { updateSettingsAction } from "@/app/actions/settings";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_META } from "@/lib/constants";
import type { AppSettings } from "@/lib/settings-schema";
import { addBusinessDays, addDays, formatISODate } from "@/lib/dates";
import { useAppData } from "@/components/app/app-data";
import { SettingsCard } from "./settings-shell";
import { cn } from "@/lib/utils";

function SaveButton({ onClick, pending, dirty }: { onClick: () => void; pending: boolean; dirty: boolean }) {
  return (
    <Button onClick={onClick} disabled={pending || !dirty}>
      Save
    </Button>
  );
}

const TIMEZONES = ["Europe/Paris", "Europe/Zurich", "Europe/Berlin", "Europe/London", "Europe/Brussels", "Europe/Madrid", "America/Montreal", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Asia/Tokyo", "UTC"];

export function GeneralSettings({ value }: { value: AppSettings["general"] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(value);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <SettingsCard title="General" footer={<SaveButton pending={pending} dirty={dirty} onClick={() => run(() => updateSettingsAction("general", v), { success: "Saved" })} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Your name" hint="Greetings and email templates">
          <Input value={v.userName} onChange={(e) => setV({ ...v, userName: e.target.value })} />
        </FormField>
        <FormField label="Timezone" hint="“Today”, deadlines and interview times use it">
          <Select value={v.timezone} onValueChange={(tz) => setV({ ...v, timezone: tz })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([v.timezone, ...TIMEZONES])].map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Date format">
          <Select value={v.dateLocale} onValueChange={(l) => setV({ ...v, dateLocale: l })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["en-GB", "29/09/2026 — 29 Sept 2026"],
                ["fr-FR", "29/09/2026 — 29 sept. 2026"],
                ["en-US", "09/29/2026 — Sep 29, 2026"],
                ["de-CH", "29.09.2026 — 29. Sept. 2026"],
              ].map(([k, l]) => (
                <SelectItem key={k} value={k}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Week starts on">
          <Select value={String(v.weekStartsOn)} onValueChange={(d) => setV({ ...v, weekStartsOn: Number(d) })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Monday</SelectItem>
              <SelectItem value="0">Sunday</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Default currency">
          <Input value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} />
        </FormField>
      </div>
    </SettingsCard>
  );
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const options = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ];
  return (
    <SettingsCard title="Appearance" description="Stored in this browser.">
      <div className="grid grid-cols-3 gap-3">
        {options.map((o) => (
          <button key={o.key} type="button" onClick={() => setTheme(o.key)} className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-sm", theme === o.key && "border-primary bg-primary/5")}>
            <o.icon className="size-5" />
            {o.label}
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}

export function ProfileSettings({ value }: { value: AppSettings["profile"] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(value);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const list = (key: keyof AppSettings["profile"], label: string, hint?: string) => (
    <FormField label={label} hint={hint}>
      <ListEditor value={(v[key] as string[]) ?? []} onChange={(items) => setV({ ...v, [key]: items })} rows={3} />
    </FormField>
  );
  return (
    <SettingsCard
      title="Profile"
      description="Used only to compare opportunities with your background (skills overlap and AI analysis). Tip: ask Claude Code “lis mon CV et remplis mon profil Career OS”."
      footer={<SaveButton pending={pending} dirty={dirty} onClick={() => run(() => updateSettingsAction("profile", v), { success: "Profile saved" })} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name">
          <Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
        </FormField>
        <FormField label="Years of experience">
          <NumberInput value={v.yearsOfExperience} onChange={(n) => setV({ ...v, yearsOfExperience: n })} />
        </FormField>
        <FormField label="Headline" className="sm:col-span-2">
          <Input value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} placeholder="Full-stack engineer — HealthTech & AI" />
        </FormField>
        <FormField label="Summary" className="sm:col-span-2">
          <Textarea value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} rows={4} />
        </FormField>
        {list("skills", "Skills & technologies", "One per line — compared with each posting")}
        {list("languages", "Languages", "e.g. English — C1")}
        {list("education", "Education")}
        {list("targetRoles", "Target roles")}
        {list("targetDomains", "Target domains")}
        {list("preferredLocations", "Preferred locations")}
        {list("dealBreakers", "Deal-breakers")}
      </div>
    </SettingsCard>
  );
}

export function FollowUpSettings({ value }: { value: AppSettings["followUp"] }) {
  const { run, pending } = useAction();
  const { today } = useAppData();
  const [v, setV] = useState(value);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const example = v.businessDays ? addBusinessDays(today, v.defaultDays.JOB, { holidays: v.holidays }) : addDays(today, v.defaultDays.JOB);
  return (
    <SettingsCard
      title="Follow-ups"
      description="Deterministic rules — no AI involved."
      footer={<SaveButton pending={pending} dirty={dirty} onClick={() => run(() => updateSettingsAction("followUp", v), { success: "Saved" })} />}
    >
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">Delay after applying, per type (days — 0 disables)</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OPPORTUNITY_TYPES.map((t) => (
            <FormField key={t} label={OPPORTUNITY_TYPE_META[t].label}>
              <NumberInput value={v.defaultDays[t]} onChange={(n) => setV({ ...v, defaultDays: { ...v.defaultDays, [t]: Math.max(0, Math.round(n ?? 0)) } })} />
            </FormField>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="biz" checked={v.businessDays} onCheckedChange={(b) => setV({ ...v, businessDays: b })} />
        <Label htmlFor="biz">Count business days only</Label>
        <Select value={v.holidays} onValueChange={(h) => setV({ ...v, holidays: h as "FR" | "NONE" })}>
          <SelectTrigger size="sm" className="ml-2 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FR">Skip French public holidays</SelectItem>
            <SelectItem value="NONE">No public holidays</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="rounded-lg bg-muted-background px-3 py-2 text-xs text-muted-foreground">
        Example: a job applied today → follow-up on <span className="font-medium text-foreground">{formatISODate(example, "long")}</span>.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="When a recruiter contacted you" hint="Source = Recruiter">
          <NumberInput value={v.recruiterDays} onChange={(n) => setV({ ...v, recruiterDays: Math.max(0, n ?? 0) })} />
        </FormField>
        <FormField label="After an interview" hint="Days after it is marked as done">
          <NumberInput value={v.postInterviewDays} onChange={(n) => setV({ ...v, postInterviewDays: Math.max(0, n ?? 0) })} />
        </FormField>
        <FormField label="“Waiting” after" hint="Days without answer">
          <NumberInput value={v.waitingThresholdDays} onChange={(n) => setV({ ...v, waitingThresholdDays: Math.max(0, n ?? 0) })} />
        </FormField>
        <FormField label="Suggest “Ghosted” after" hint="Follow-ups without answer">
          <NumberInput value={v.maxFollowUps} onChange={(n) => setV({ ...v, maxFollowUps: Math.max(1, n ?? 3) })} />
        </FormField>
        <FormField label="…and days since last contact">
          <NumberInput value={v.ghostAfterDays} onChange={(n) => setV({ ...v, ghostAfterDays: Math.max(0, n ?? 30) })} />
        </FormField>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="auto" checked={v.autoScheduleOnApply} onCheckedChange={(b) => setV({ ...v, autoScheduleOnApply: b })} />
          <Label htmlFor="auto">Schedule the first follow-up automatically when an application is submitted</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="stage" checked={v.moveToFollowUpStage} onCheckedChange={(b) => setV({ ...v, moveToFollowUpStage: b })} />
          <Label htmlFor="stage">Move job applications to “Followed up” when a follow-up is logged</Label>
        </div>
      </div>
    </SettingsCard>
  );
}
