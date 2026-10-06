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
  { value: NONE, label: "Manual" },
  { value: "status:APPLIED", label: "When submitted" },
  { value: "followup", label: "At first follow-up" },
  { value: "interview", label: "When an interview is done" },
  { value: "doc:CV", label: "When a CV is attached" },
  { value: "doc:COVER_LETTER", label: "When a letter is attached" },
  { value: "doc:TRANSCRIPT", label: "When transcripts are attached" },
  { value: "doc:RECOMMENDATION", label: "When a recommendation is attached" },
  { value: "doc:LANGUAGE_CERT", label: "When a language certificate is attached" },
  { value: "doc:PORTFOLIO", label: "When a portfolio is attached" },
];

export function TemplateSettings({ value }: { value: AppSettings["templates"] }) {
  const { run, pending } = useAction();
  const [type, setType] = useState<OpportunityType>("JOB");
  const [v, setV] = useState(value);
  const items = v[type] ?? [];
  const setItems = (next: ChecklistTemplateItem[]) => setV({ ...v, [type]: next });
  const dirty = JSON.stringify(v) !== JSON.stringify(value);
  return (
    <SettingsCard
      title="Checklist templates"
      description="Steps created for each new opportunity of a type. Documents required by a posting are added automatically on top."
      footer={
        <>
          <Button variant="ghost" onClick={() => setItems(DEFAULT_CHECKLISTS[type])}>
            <RotateCcw /> Reset this type
          </Button>
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("templates", v), { success: "Templates saved" })}>
            Save
          </Button>
        </>
      }
    >
      <Select value={type} onValueChange={(t) => setType(t as OpportunityType)}>
        <SelectTrigger className="w-60">
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
            <Input value={item.title} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <Select value={item.kind} onValueChange={(k) => setItems(items.map((x, j) => (j === i ? { ...x, kind: k as ChecklistTemplateItem["kind"] } : x)))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k.toLowerCase().replace("_", " ")}
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
            <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={() => setItems([...items, { title: "", kind: "CHECKLIST", autoRule: null, when: null }])}>
        <Plus /> Add step
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
      title="Email templates"
      description={
        <>
          Variables: <code>{"{{contactFirstName}} {{contactName}} {{title}} {{organization}} {{appliedDate}} {{userName}} {{today}}"}</code>. Career OS only drafts — you send.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setList(DEFAULT_EMAIL_TEMPLATES)}>
            <RotateCcw /> Restore defaults
          </Button>
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("emailTemplates", list), { success: "Templates saved" })}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Template" />
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
            setList([...list, { id, name: "New template", language: "fr", purpose: "OTHER", subject: "", body: "" }]);
            setSelected(id);
          }}
        >
          <Plus /> New
        </Button>
        {current && (
          <Button variant="ghost" onClick={() => (setList(list.filter((t) => t.id !== selected)), setSelected(list[0]?.id ?? ""))}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>
      {current && (
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Name">
            <Input value={current.name} onChange={(e) => update({ name: e.target.value })} />
          </FormField>
          <FormField label="Language">
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
          <FormField label="Purpose">
            <Select value={current.purpose} onValueChange={(p) => update({ purpose: p as EmailTemplate["purpose"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["FOLLOW_UP", "THANK_YOU", "NETWORKING", "WITHDRAW", "OTHER"].map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.toLowerCase().replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Subject" className="sm:col-span-3">
            <Input value={current.subject} onChange={(e) => update({ subject: e.target.value })} />
          </FormField>
          <FormField label="Body" className="sm:col-span-3">
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
      title="Automation rules"
      description="Trigger → condition → action. Rules only create tasks and suggestions; they never contact anyone. Periodic rules run every 15 minutes and when you open Today."
      footer={
        <>
          <Button variant="outline" onClick={() => run(() => runRulesAction(), { success: (s) => `Rules evaluated — ${Object.values(s).reduce((a, b) => a + b, 0)} new item(s)` })}>
            <Play /> Run now
          </Button>
          <Button disabled={!dirty || pending} onClick={() => run(() => updateSettingsAction("automation", v), { success: "Rules saved" })}>
            Save
          </Button>
        </>
      }
    >
      <ul className="surface-list rounded-xl">
        {RULE_KEYS.map((key) => (
          <li key={key} className="flex flex-wrap items-center gap-3 px-3 py-3">
            <Switch checked={v[key].enabled} onCheckedChange={(b) => setV({ ...v, [key]: { ...v[key], enabled: b } })} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{RULE_META[key].title}</p>
              <p className="text-xs text-muted-foreground">{RULE_META[key].description}</p>
            </div>
            {key !== "ghost_suggestion" && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">N =</Label>
                <NumberInput value={v[key].days} onChange={(n) => setV({ ...v, [key]: { ...v[key], days: Math.max(0, Math.round(n ?? 0)) } })} className="h-7 w-16" />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Built-in behaviors (always on): follow-up scheduling on application, “Followed up” stage, checklist auto-completion when documents are attached, pending follow-ups cleared when an interview is planned.</p>
    </SettingsCard>
  );
}

const METRICS = [
  { value: "APPLICATIONS_SENT", label: "Applications sent" },
  { value: "OPPORTUNITIES_ADDED", label: "Opportunities added / researched" },
  { value: "INTERVIEWS", label: "Interviews" },
  { value: "FOLLOW_UPS", label: "Follow-ups sent" },
];

export function GoalSettings({ goals }: { goals: Goal[] }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState("APPLICATIONS_SENT");
  const [target, setTarget] = useState<number | null>(20);
  const [period, setPeriod] = useState("MONTH");
  const [family, setFamily] = useState<string>(NONE);
  const [tag, setTag] = useState("");
  return (
    <SettingsCard title="Goals" description="Progress is shown on the dashboard.">
      <ul className="surface-list rounded-xl">
        {goals.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No goal yet.</li>}
        {goals.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="flex-1 text-sm">
              {g.title}
              <span className="ml-2 text-xs text-muted-foreground">
                {METRICS.find((m) => m.value === g.metric)?.label} · {g.target} per {g.period.toLowerCase()}
                {g.filters?.family ? ` · ${g.filters.family.toLowerCase()}` : ""}
                {g.filters?.tags?.length ? ` · #${g.filters.tags.join(" #")}` : ""}
              </span>
            </span>
            <Switch checked={!g.archived} onCheckedChange={(b) => run(() => updateGoalAction(g.id, { archived: !b }))} />
            <Button size="icon-xs" variant="ghost" onClick={() => run(() => deleteGoalAction(g.id), { success: "Goal deleted" })} aria-label="Delete">
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Title" className="sm:col-span-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="20 applications this month" />
        </FormField>
        <FormField label="Metric">
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
        <FormField label="Target">
          <NumberInput value={target} onChange={setTarget} />
        </FormField>
        <FormField label="Period">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WEEK">Week</SelectItem>
              <SelectItem value="MONTH">Month</SelectItem>
              <SelectItem value="QUARTER">Quarter</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Only">
          <Select value={family} onValueChange={setFamily}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Everything</SelectItem>
              <SelectItem value="JOB">Jobs</SelectItem>
              <SelectItem value="EDUCATION">Education</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="With tag (optional)">
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
                { success: "Goal added", onSuccess: () => setTitle("") },
              )
            }
          >
            <Plus /> Add goal
          </Button>
        </div>
      </div>
      <Progress value={0} className="hidden" />
    </SettingsCard>
  );
}
