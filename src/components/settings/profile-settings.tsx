"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, CodeXml, FileUp, FolderInput, GraduationCap, Languages, MoreHorizontal, Pencil, Plus, ScrollText, ShieldCheck, Sparkles, Tag, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField, NumberInput } from "@/components/app/fields";
import { useAction } from "@/hooks/use-action";
import { skillIconsAction, updateSettingsAction } from "@/app/actions/settings";
import type { AppSettings } from "@/lib/settings-schema";
import { PROFILE_FIELD_LABELS } from "@/lib/cv-import";
import { categoryIcon, flattenSkillGroups, groupSkills, OTHER_GROUP, SKILL_CATEGORIES, type SkillCategoryIcon, type SkillGroup } from "@/lib/skills";
import type { SkillIcon } from "@/server/skill-icons";
import { SettingsCard } from "./settings-shell";
import { CvImportDialog } from "./cv-import-dialog";
import { cn } from "@/lib/utils";

type Profile = AppSettings["profile"];

const CATEGORY_ICONS: Record<SkillCategoryIcon, React.ComponentType<{ className?: string }>> = {
  ai: Sparkles,
  code: CodeXml,
  product: Boxes,
  infra: ShieldCheck,
  tools: Wrench,
  regulatory: ScrollText,
  other: Tag,
};

function luminance(hex: string) {
  const n = Number.parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Brand mark of a technology; near-black brands follow the text color so they stay visible in dark mode. */
export function BrandIcon({ icon, className }: { icon: SkillIcon; className?: string }) {
  const dark = luminance(icon.hex) < 0.06;
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={icon.title} className={cn("size-3.5 shrink-0", className)} fill={dark ? "currentColor" : `#${icon.hex}`}>
      <path d={icon.path} />
    </svg>
  );
}

/** Profile page: identity, skills arranged by category (with brand icons), languages, education and search criteria. */
export function ProfileSettings({ value, icons: initialIcons }: { value: Profile; icons: Record<string, SkillIcon> }) {
  const { run, pending } = useAction();
  const initial = useMemo(() => ({ ...value, skillGroups: groupSkills(value.skills, value.skillGroups) }), [value]);
  const [v, setV] = useState<Profile>(initial);
  const [icons, setIcons] = useState(initialIcons);
  const [importing, setImporting] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const groups = useMemo(() => groupSkills(v.skills, v.skillGroups, { keepEmpty: true }), [v.skills, v.skillGroups]);
  const setGroups = (next: SkillGroup[]) => setV((p) => ({ ...p, skillGroups: next, skills: flattenSkillGroups(next) }));

  // Look up the brand icon of skills added in the editor.
  const asked = useRef(new Set(Object.keys(initialIcons)));
  useEffect(() => {
    const missing = v.skills.filter((s) => !asked.current.has(s));
    if (!missing.length) return;
    missing.forEach((s) => asked.current.add(s));
    const t = setTimeout(() => {
      void skillIconsAction(missing).then((res) => res.ok && setIcons((cur) => ({ ...cur, ...res.data })));
    }, 300);
    return () => clearTimeout(t);
  }, [v.skills]);

  const save = (next: Profile = v) => {
    const cleaned = { ...next, skillGroups: next.skillGroups.filter((g) => g.skills.length > 0) };
    run(() => updateSettingsAction("profile", cleaned), { success: "Profil enregistré" });
  };
  const saveButton = (
    <Button onClick={() => save()} disabled={pending || !dirty}>
      Enregistrer
    </Button>
  );
  const list = (key: "languages" | "targetRoles" | "targetDomains" | "preferredLocations" | "dealBreakers", placeholder: string) => (
    <FormField label={PROFILE_FIELD_LABELS[key]}>
      <ChipsInput value={v[key]} onChange={(items) => setV({ ...v, [key]: items })} placeholder={placeholder} />
    </FormField>
  );

  return (
    <>
      <SettingsCard
        title="Profil"
        description="Sert à comparer les opportunités avec ton parcours (compétences communes, analyses IA) et à préparer tes candidatures."
        footer={
          <>
            {dirty && <span className="mr-auto self-center text-xs text-muted-foreground">Modifications non enregistrées</span>}
            {saveButton}
          </>
        }
      >
        <div className="@container">
          <div className="flex flex-col items-start gap-3 rounded-xl bg-muted-background px-3 py-3 @lg:flex-row @lg:items-center @lg:justify-between">
            <p className="copy-sm text-muted-foreground">Préremplis le profil à partir de ton CV, puis vérifie chaque champ avant d’enregistrer.</p>
            <Button variant="outline" className="shrink-0 whitespace-nowrap" onClick={() => setImporting(true)}>
              <FileUp /> Importer depuis un CV
            </Button>
          </div>
        </div>
        <div className="grid gap-4 @md:grid-cols-[minmax(0,1fr)_160px]">
          <FormField label={PROFILE_FIELD_LABELS.fullName}>
            <Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />
          </FormField>
          <FormField label={PROFILE_FIELD_LABELS.yearsOfExperience}>
            <NumberInput value={v.yearsOfExperience} onChange={(n) => setV({ ...v, yearsOfExperience: n })} />
          </FormField>
          <FormField label={PROFILE_FIELD_LABELS.headline} className="@md:col-span-2">
            <Input value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} placeholder="Ingénieur full-stack — HealthTech et IA" />
          </FormField>
          <FormField label={PROFILE_FIELD_LABELS.summary} className="@md:col-span-2">
            <Textarea value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} rows={5} />
          </FormField>
        </div>
      </SettingsCard>

      <SettingsCard title="Compétences" description={`${v.skills.length} compétences, comparées à chaque offre. Range-les par catégorie ; les nouvelles se classent toutes seules.`} footer={saveButton}>
        <SkillsEditor groups={groups} icons={icons} onChange={setGroups} />
      </SettingsCard>

      <SettingsCard title="Langues et formation" footer={saveButton}>
        <FormField label={PROFILE_FIELD_LABELS.languages}>
          <ChipsInput value={v.languages} onChange={(items) => setV({ ...v, languages: items })} placeholder="Anglais (C1)…" icon={Languages} />
        </FormField>
        <FormField label={PROFILE_FIELD_LABELS.education}>
          <RowsInput value={v.education} onChange={(items) => setV({ ...v, education: items })} placeholder="Diplôme, école, années…" icon={GraduationCap} />
        </FormField>
      </SettingsCard>

      <SettingsCard title="Ce que tu cherches" footer={saveButton}>
        <div className="grid gap-4 @xl:grid-cols-2">
          {list("targetRoles", "Software Engineer…")}
          {list("targetDomains", "HealthTech…")}
          {list("preferredLocations", "Bruxelles, Remote…")}
          {list("dealBreakers", "Pas de full présentiel…")}
        </div>
      </SettingsCard>

      {importing && (
        <CvImportDialog
          open={importing}
          onOpenChange={setImporting}
          current={v}
          saving={pending}
          onApply={(next) => {
            // New skills from the CV land in their guessed category.
            const merged = { ...next, skillGroups: groupSkills(next.skills, v.skillGroups) };
            setV(merged);
            run(() => updateSettingsAction("profile", merged), { success: "Profil mis à jour à partir du CV", onSuccess: () => setImporting(false) });
          }}
        />
      )}
    </>
  );
}

function SkillsEditor({ groups, icons, onChange }: { groups: SkillGroup[]; icons: Record<string, SkillIcon>; onChange: (groups: SkillGroup[]) => void }) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const update = (i: number, g: SkillGroup) => onChange(groups.map((x, j) => (j === i ? g : x)));
  const exists = (skill: string) => groups.some((g) => g.skills.some((s) => s.toLowerCase() === skill.toLowerCase()));
  const move = (skill: string, from: number, to: number) =>
    onChange(groups.map((g, j) => (j === from ? { ...g, skills: g.skills.filter((s) => s !== skill) } : j === to ? { ...g, skills: [...g.skills, skill] } : g)));
  const swap = (i: number, j: number) => {
    const next = [...groups];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  // A removed category's skills go to "Autres" (deleting "Autres" removes them).
  const removeGroup = (i: number) => {
    const g = groups[i];
    const rest = groups.filter((_, j) => j !== i);
    if (g.name === OTHER_GROUP || !g.skills.length) return onChange(rest);
    const k = rest.findIndex((x) => x.name === OTHER_GROUP);
    onChange(k >= 0 ? rest.map((x, j) => (j === k ? { ...x, skills: [...x.skills, ...g.skills] } : x)) : [...rest, { name: OTHER_GROUP, skills: g.skills }]);
  };
  const unusedDefaults = SKILL_CATEGORIES.map((c) => c.name).filter((n) => !groups.some((g) => g.name === n));

  return (
    <div className="space-y-5">
      {groups.map((g, i) => {
        const Icon = CATEGORY_ICONS[categoryIcon(g.name)];
        return (
          <div key={`${g.name}-${i}`} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted-background text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
              {renaming === i ? (
                <Input
                  autoFocus
                  defaultValue={g.name}
                  className="h-7 max-w-64 text-sm"
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name) update(i, { ...g, name });
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <h3 className="label-sm text-foreground">{g.name}</h3>
              )}
              <span className="text-xs text-faint tabular-nums">{g.skills.length}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Actions de la catégorie ${g.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setRenaming(i)}>
                    <Pencil /> Renommer
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === 0} onClick={() => swap(i, i - 1)}>
                    <ArrowUp /> Monter
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === groups.length - 1} onClick={() => swap(i, i + 1)}>
                    <ArrowDown /> Descendre
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => removeGroup(i)}>
                    <Trash2 /> {g.name === OTHER_GROUP && g.skills.length ? "Supprimer avec ses compétences" : g.skills.length ? `Supprimer (compétences vers ${OTHER_GROUP})` : "Supprimer"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {g.skills.map((s) => (
                <span key={s} className="group/chip inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-background py-1 pr-1 pl-2 text-sm shadow-xs">
                  {icons[s] ? <BrandIcon icon={icons[s]} /> : <span className="size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />}
                  <span className="truncate">{s}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="rounded p-0.5 text-faint opacity-60 hover:bg-hover hover:text-foreground group-hover/chip:opacity-100" aria-label={`Options de ${s}`}>
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel className="max-w-56 truncate">{s}</DropdownMenuLabel>
                      {groups.length > 1 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <FolderInput /> Déplacer vers
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {groups.map((t, j) =>
                              j === i ? null : (
                                <DropdownMenuItem key={`${t.name}-${j}`} onClick={() => move(s, i, j)}>
                                  {t.name}
                                </DropdownMenuItem>
                              ),
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuItem variant="destructive" onClick={() => update(i, { ...g, skills: g.skills.filter((x) => x !== s) })}>
                        <X /> Retirer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              ))}
              <AddInline placeholder="Ajouter…" onAdd={(items) => update(i, { ...g, skills: [...g.skills, ...items.filter((x) => !exists(x))] })} />
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-separator pt-4">
        <span className="mr-1 text-xs text-muted-foreground">Nouvelle catégorie :</span>
        {unusedDefaults.map((n) => (
          <Button key={n} size="xs" variant="outline" onClick={() => onChange([...groups, { name: n, skills: [] }])}>
            <Plus /> {n}
          </Button>
        ))}
        <AddInline placeholder="Autre nom…" onAdd={(items) => onChange([...groups, ...items.filter((n) => !groups.some((g) => g.name === n)).map((name) => ({ name, skills: [] }))])} />
      </div>
    </div>
  );
}

/** Small input that adds one or several items (comma or Enter separated). */
function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (items: string[]) => void }) {
  const [text, setText] = useState("");
  const commit = () => {
    const items = text
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length) onAdd(items);
    setText("");
  };
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
      placeholder={placeholder}
      className="h-8 w-32 rounded-lg border border-dashed border-border bg-transparent px-2 text-sm outline-none placeholder:text-faint focus:w-48 focus:border-border-form-active focus:border-solid"
      aria-label={placeholder}
    />
  );
}

/** Short items as removable chips, plus an inline input. */
function ChipsInput({ value, onChange, placeholder, icon: Icon }: { value: string[]; onChange: (items: string[]) => void; placeholder: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((s) => (
        <span key={s} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-background py-1 pr-1 pl-2 text-sm shadow-xs">
          {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{s}</span>
          <button type="button" onClick={() => onChange(value.filter((x) => x !== s))} className="rounded p-0.5 text-faint hover:bg-hover hover:text-foreground" aria-label={`Retirer ${s}`}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <AddInline placeholder={placeholder} onAdd={(items) => onChange([...value, ...items.filter((x) => !value.includes(x))])} />
    </div>
  );
}

/** Long items (a degree, a certification) as rows. */
function RowsInput({ value, onChange, placeholder, icon: Icon }: { value: string[]; onChange: (items: string[]) => void; placeholder: string; icon: React.ComponentType<{ className?: string }> }) {
  const [text, setText] = useState("");
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {value.map((s, i) => (
        <div key={`${s}-${i}`} className="flex items-start gap-2.5 border-b border-separator px-3 py-2.5 text-sm">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <input value={s} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => onChange(value.map((x) => x.trim()).filter(Boolean))} className="min-w-0 flex-1 bg-transparent outline-none" aria-label={`Élément ${i + 1}`} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded p-0.5 text-faint hover:bg-hover hover:text-foreground" aria-label={`Retirer ${s}`}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Plus className="size-4 shrink-0 text-faint" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              e.preventDefault();
              onChange([...value, text.trim()]);
              setText("");
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          aria-label={placeholder}
        />
      </div>
    </div>
  );
}
