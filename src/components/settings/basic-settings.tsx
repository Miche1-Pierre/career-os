"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, NumberInput } from "@/components/app/fields";
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
      Enregistrer
    </Button>
  );
}

const TIMEZONES = ["Europe/Paris", "Europe/Zurich", "Europe/Berlin", "Europe/London", "Europe/Brussels", "Europe/Madrid", "America/Montreal", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Asia/Tokyo", "UTC"];

export function GeneralSettings({ value }: { value: AppSettings["general"] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(value);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <SettingsCard title="Général" footer={<SaveButton pending={pending} dirty={dirty} onClick={() => run(() => updateSettingsAction("general", v), { success: "Paramètres enregistrés" })} />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Votre nom" hint="Utilisé dans les salutations et les modèles d’e-mails">
          <Input value={v.userName} onChange={(e) => setV({ ...v, userName: e.target.value })} />
        </FormField>
        <FormField label="Fuseau horaire" hint="Sert pour « Aujourd’hui », les dates limites et les heures d’entretien">
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
        <FormField label="Format des dates">
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
        <FormField label="Premier jour de la semaine">
          <Select value={String(v.weekStartsOn)} onValueChange={(d) => setV({ ...v, weekStartsOn: Number(d) })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Lundi</SelectItem>
              <SelectItem value="0">Dimanche</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Devise par défaut">
          <Input value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} />
        </FormField>
      </div>
    </SettingsCard>
  );
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const options = [
    { key: "light", label: "Clair", icon: Sun },
    { key: "dark", label: "Sombre", icon: Moon },
    { key: "system", label: "Système", icon: Monitor },
  ];
  return (
    <SettingsCard title="Apparence" description="Enregistrée dans ce navigateur.">
      <div className="grid grid-cols-3 gap-3">
        {options.map((o) => (
          <button key={o.key} type="button" aria-pressed={theme === o.key} onClick={() => setTheme(o.key)} className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-sm whitespace-nowrap", theme === o.key && "border-primary bg-primary/5")}>
            <o.icon className="size-5" />
            {o.label}
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}

export function FollowUpSettings({ value }: { value: AppSettings["followUp"] }) {
  const { run, pending } = useAction();
  const { today, dateLocale } = useAppData();
  const [v, setV] = useState(value);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  const example = v.businessDays ? addBusinessDays(today, v.defaultDays.JOB, { holidays: v.holidays }) : addDays(today, v.defaultDays.JOB);
  return (
    <SettingsCard
      title="Relances"
      description="Règles déterministes, sans IA."
      footer={<SaveButton pending={pending} dirty={dirty} onClick={() => run(() => updateSettingsAction("followUp", v), { success: "Paramètres enregistrés" })} />}
    >
      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">Délai après la candidature, par type (en jours — 0 désactive la relance)</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {OPPORTUNITY_TYPES.map((t) => (
            <FormField key={t} label={OPPORTUNITY_TYPE_META[t].label}>
              <NumberInput value={v.defaultDays[t]} onChange={(n) => setV({ ...v, defaultDays: { ...v.defaultDays, [t]: Math.max(0, Math.round(n ?? 0)) } })} />
            </FormField>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Switch id="biz" checked={v.businessDays} onCheckedChange={(b) => setV({ ...v, businessDays: b })} />
        <Label htmlFor="biz">Compter uniquement les jours ouvrés</Label>
        <Select value={v.holidays} onValueChange={(h) => setV({ ...v, holidays: h as "FR" | "NONE" })}>
          <SelectTrigger size="sm" className="w-full sm:ml-2 sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FR">Hors jours fériés français</SelectItem>
            <SelectItem value="NONE">Sans jours fériés</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="rounded-lg bg-muted-background px-3 py-2 text-xs text-muted-foreground">
        Exemple : pour un emploi postulé aujourd’hui, relance le <span className="font-medium text-foreground">{formatISODate(example, "long", dateLocale)}</span>.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Quand un recruteur vous a contacté" hint="Source = Recruteur">
          <NumberInput value={v.recruiterDays} onChange={(n) => setV({ ...v, recruiterDays: Math.max(0, n ?? 0) })} />
        </FormField>
        <FormField label="Après un entretien" hint="Jours après qu’il est marqué comme passé">
          <NumberInput value={v.postInterviewDays} onChange={(n) => setV({ ...v, postInterviewDays: Math.max(0, n ?? 0) })} />
        </FormField>
        <FormField label="« En attente » après" hint="Jours sans réponse">
          <NumberInput value={v.waitingThresholdDays} onChange={(n) => setV({ ...v, waitingThresholdDays: Math.max(0, n ?? 0) })} />
        </FormField>
        <FormField label="Proposer « Sans réponse » après" hint="Relances restées sans réponse">
          <NumberInput value={v.maxFollowUps} onChange={(n) => setV({ ...v, maxFollowUps: Math.max(1, n ?? 3) })} />
        </FormField>
        <FormField label="… et jours depuis le dernier contact">
          <NumberInput value={v.ghostAfterDays} onChange={(n) => setV({ ...v, ghostAfterDays: Math.max(0, n ?? 30) })} />
        </FormField>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="auto" checked={v.autoScheduleOnApply} onCheckedChange={(b) => setV({ ...v, autoScheduleOnApply: b })} />
          <Label htmlFor="auto">Planifier automatiquement la première relance à l’envoi d’une candidature</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="stage" checked={v.moveToFollowUpStage} onCheckedChange={(b) => setV({ ...v, moveToFollowUpStage: b })} />
          <Label htmlFor="stage">Passer les candidatures au statut « Relancé » quand une relance est notée</Label>
        </div>
      </div>
    </SettingsCard>
  );
}
