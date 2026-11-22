"use client";

import { useState } from "react";
import { Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { FormField, NumberInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { createGoalAction, deleteGoalAction, runRulesAction, updateGoalAction, updateSettingsAction } from "@/app/actions/settings";
import { OPPORTUNITY_TYPES, OPPORTUNITY_TYPE_META, TASK_KINDS, type OpportunityType } from "@/lib/constants";
import { DEFAULT_CHECKLISTS, DEFAULT_EMAIL_TEMPLATES, RULE_KEYS, RULE_META, type AppSettings, type ChecklistTemplateItem, type EmailTemplate } from "@/lib/settings-schema";
import type { Goal } from "@/server/db/schema";
import { SettingsCard } from "./settings-shell";

const NONE = "__none__";
const AUTO_RULES = [
  { value: NONE, label: "Manuelle" },
  { value: "status:APPLIED", label: "À l’envoi de la candidature" },
  { value: "followup", label: "À la première relance" },
  { value: "interview", label: "Après un entretien" },
  { value: "doc:CV", label: "Quand un CV est joint" },
  { value: "doc:COVER_LETTER", label: "Quand une lettre est jointe" },
  { value: "doc:TRANSCRIPT", label: "Quand les relevés de notes sont joints" },
  { value: "doc:RECOMMENDATION", label: "Quand une recommandation est jointe" },
  { value: "doc:LANGUAGE_CERT", label: "Quand un certificat de langue est joint" },
  { value: "doc:PORTFOLIO", label: "Quand un portfolio est joint" },
];

const TASK_KIND_LABEL: Record<(typeof TASK_KINDS)[number], string> = {
  TODO: "À faire",
  CHECKLIST: "Checklist",
  DOCUMENT: "Document",
  FOLLOW_UP: "Relance",
  PREPARATION: "Préparation",
  DEADLINE: "Date limite",
};

const PURPOSE_LABEL: Record<EmailTemplate["purpose"], string> = {
  FOLLOW_UP: "Relance",
  THANK_YOU: "Remerciement",
  NETWORKING: "Réseautage",
  WITHDRAW: "Désistement",
  OTHER: "Autre",
};

export function TemplateSettings({ value }: { value: AppSettings["templates"] }) {
  const { run, pending } = useAction();
  const [type, setType] = useState<OpportunityType>("JOB");
  const [v, setV] = useState(value);
  const items = v[type] ?? [];
  const setItems = (next: ChecklistTemplateItem[]) => setV({ ...v, [type]: next });
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <SettingsCard
      title="Modèles de checklist"
      description="Étapes créées pour chaque nouvelle opportunité de ce type. Les documents demandés par une offre s’y ajoutent automatiquement."
      footer={
        <>
          <Button variant="ghost" onClick={() => setItems(DEFAULT_CHECKLISTS[type])}>
            <RotateCcw /> Réinitialiser ce type
          </Button>
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("templates", v), { success: "Modèles enregistrés" })}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Select value={type} onValueChange={(t) => setType(t as OpportunityType)}>
        <SelectTrigger className="w-full sm:w-60" aria-label="Type d’opportunité">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPPORTUNITY_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {OPPORTUNITY_TYPE_META[t].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_130px_200px_auto]">
            <Input value={item.title} aria-label="Intitulé de l’étape" onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Select value={item.kind} onValueChange={(k) => setItems(items.map((x, j) => (j === i ? { ...x, kind: k as ChecklistTemplateItem["kind"] } : x)))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {TASK_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={item.autoRule ?? NONE} onValueChange={(r) => setItems(items.map((x, j) => (j === i ? { ...x, autoRule: r === NONE ? null : r } : x)))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_RULES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Retirer l’étape">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={() => setItems([...items, { title: "", kind: "CHECKLIST", autoRule: null, when: null }])}>
        <Plus /> Ajouter une étape
      </Button>
    </SettingsCard>
  );
}

export function EmailTemplateSettings({ value }: { value: AppSettings["emailTemplates"] }) {
  const { run, pending } = useAction();
  const [list, setList] = useState<EmailTemplate[]>(value);
  const [selected, setSelected] = useState(value[0]?.id ?? "");
  const current = list.find((t) => t.id === selected);
  const update = (patch: Partial<EmailTemplate>) => setList(list.map((t) => (t.id === selected ? { ...t, ...patch } : t)));
  const dirty = JSON.stringify(list) !== JSON.stringify(value);
  return (
    <SettingsCard
      title="Modèles d’e-mails"
      description={
        <>
          Variables : <code className="break-all">{"{{contactFirstName}} {{contactName}} {{title}} {{organization}} {{appliedDate}} {{userName}} {{today}}"}</code>. Career OS ne fait que rédiger : c’est vous qui envoyez.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setList(DEFAULT_EMAIL_TEMPLATES)}>
            <RotateCcw /> Modèles par défaut
          </Button>
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("emailTemplates", list), { success: "Modèles enregistrés" })}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-72" aria-label="Modèle">
            <SelectValue placeholder="Modèle" />
          </SelectTrigger>
          <SelectContent>
            {list.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => {
            const id = `custom-${Date.now()}`;
            setList([...list, { id, name: "Nouveau modèle", language: "fr", purpose: "OTHER", subject: "", body: "" }]);
            setSelected(id);
          }}
        >
          <Plus /> Nouveau
        </Button>
        {current && (
          <Button variant="ghost" onClick={() => (setList(list.filter((t) => t.id !== selected)), setSelected(list[0]?.id ?? ""))}>
            <Trash2 /> Supprimer
          </Button>
        )}
      </div>
      {current && (
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Nom">
            <Input value={current.name} onChange={(e) => update({ name: e.target.value })} />
          </FormField>
          <FormField label="Langue">
            <Select value={current.language} onValueChange={(l) => update({ language: l as "fr" | "en" })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Usage">
            <Select value={current.purpose} onValueChange={(p) => update({ purpose: p as EmailTemplate["purpose"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["FOLLOW_UP", "THANK_YOU", "NETWORKING", "WITHDRAW", "OTHER"].map((p) => (
                  <SelectItem key={p} value={p}>
                    {PURPOSE_LABEL[p as EmailTemplate["purpose"]]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Objet" className="sm:col-span-3">
            <Input value={current.subject} onChange={(e) => update({ subject: e.target.value })} />
          </FormField>
          <FormField label="Corps du message" className="sm:col-span-3">
            <Textarea value={current.body} onChange={(e) => update({ body: e.target.value })} rows={10} className="font-mono text-[13px]" />
          </FormField>
        </div>
      )}
    </SettingsCard>
  );
}

export function AutomationSettings({ value }: { value: AppSettings["automation"] }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(value);
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <SettingsCard
      title="Règles d’automatisation"
      description="Déclencheur → condition → action. Les règles créent uniquement des tâches et des suggestions : elles ne contactent jamais personne. Les règles périodiques s’exécutent toutes les 15 minutes et à l’ouverture d’« Aujourd’hui »."
      footer={
        <>
          <Button variant="outline" onClick={() => run(() => runRulesAction(), { success: (s) => {
                    const n = Object.values(s).reduce((a, b) => a + b, 0);
                    return `Règles évaluées : ${n} nouvel${n > 1 ? "s" : ""} élément${n > 1 ? "s" : ""}`;
                  } })}>
            <Play /> Exécuter maintenant
          </Button>
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("automation", v), { success: "Règles enregistrées" })}>
            Enregistrer
          </Button>
        </>
      }
    >
      <ul className="surface-list rounded-xl">
        {RULE_KEYS.map((key) => (
          <li key={key} className="flex flex-wrap items-center gap-3 px-3 py-3">
            <Switch checked={v[key].enabled} aria-label={RULE_META[key].title} onCheckedChange={(b) => setV({ ...v, [key]: { ...v[key], enabled: b } })} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{RULE_META[key].title}</p>
              <p className="text-xs text-muted-foreground">{RULE_META[key].description}</p>
            </div>
            {key !== "ghost_suggestion" && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">N =</Label>
                <NumberInput value={v[key].days} onChange={(n) => setV({ ...v, [key]: { ...v[key], days: Math.max(0, Math.round(n ?? 0)) } })} className="h-7 w-16" />
                <span className="text-xs text-muted-foreground">jours</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Comportements intégrés (toujours actifs) : planification des relances à l’envoi d’une candidature, statut « Relancé », cochage automatique de la checklist quand des documents sont joints, relances en attente annulées quand un entretien est planifié.</p>
    </SettingsCard>
  );
}

const METRICS = [
  { value: "APPLICATIONS_SENT", label: "Candidatures envoyées" },
  { value: "OPPORTUNITIES_ADDED", label: "Opportunités ajoutées / explorées" },
  { value: "INTERVIEWS", label: "Entretiens" },
  { value: "FOLLOW_UPS", label: "Relances envoyées" },
];

const PERIOD_LABEL: Record<string, string> = { WEEK: "semaine", MONTH: "mois", QUARTER: "trimestre" };
const GOAL_FAMILY_LABEL: Record<string, string> = { JOB: "emplois", EDUCATION: "études" };

export function GoalSettings({ goals }: { goals: Goal[] }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState("APPLICATIONS_SENT");
  const [target, setTarget] = useState<number | null>(20);
  const [period, setPeriod] = useState("MONTH");
  const [family, setFamily] = useState<string>(NONE);
  const [tag, setTag] = useState("");
  return (
    <SettingsCard title="Objectifs" description="La progression s’affiche sur le tableau de bord.">
      <ul className="surface-list rounded-xl">
        {goals.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Aucun objectif pour l’instant.</li>}
        {goals.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 text-sm break-words">
              {g.title}
              <span className="ml-2 text-xs text-muted-foreground">
                {METRICS.find((m) => m.value === g.metric)?.label} · {g.target} par {PERIOD_LABEL[g.period] ?? g.period.toLowerCase()}
                {g.filters?.family ? ` · ${GOAL_FAMILY_LABEL[g.filters.family] ?? g.filters.family.toLowerCase()}` : ""}
                {g.filters?.tags?.length ? ` · #${g.filters.tags.join(" #")}` : ""}
              </span>
            </span>
            <Switch checked={!g.archived} aria-label="Objectif actif" onCheckedChange={(b) => run(() => updateGoalAction(g.id, { archived: !b }))} />
            <Button size="icon-xs" variant="ghost" onClick={() => run(() => deleteGoalAction(g.id), { success: "Objectif supprimé" })} aria-label="Supprimer l’objectif">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Intitulé" className="sm:col-span-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="20 candidatures ce mois-ci" />
        </FormField>
        <FormField label="Indicateur">
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Cible">
          <NumberInput value={target} onChange={setTarget} />
        </FormField>
        <FormField label="Période">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WEEK">Semaine</SelectItem>
              <SelectItem value="MONTH">Mois</SelectItem>
              <SelectItem value="QUARTER">Trimestre</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Uniquement">
          <Select value={family} onValueChange={setFamily}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Tout</SelectItem>
              <SelectItem value="JOB">Emplois</SelectItem>
              <SelectItem value="EDUCATION">Études</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Avec le tag (facultatif)">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="HealthTech" />
        </FormField>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!title.trim() || !target || pending}
            onClick={() =>
              run(
                () =>
                  createGoalAction({
                    title: title.trim(),
                    metric: metric as never,
                    target: target ?? 1,
                    period: period as "WEEK" | "MONTH" | "QUARTER",
                    filters: { ...(family !== NONE ? { family: family as "JOB" | "EDUCATION" } : {}), ...(tag.trim() ? { tags: [tag.trim()] } : {}) },
                  }),
                { success: "Objectif ajouté", onSuccess: () => setTitle("") },
              )
            }
          >
            <Plus /> Ajouter l’objectif
          </Button>
        </div>
      </div>
      <Progress value={0} className="hidden" />
    </SettingsCard>
  );
}
