import Link from "next/link";
import {
  Bookmark,
  CalendarClock,
  DatabaseBackup,
  FolderOpen,
  ListChecks,
  Mail,
  Palette,
  Plug,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Target,
  UserRound,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

export const SETTINGS_NAV: readonly { key: string; label: string; group: string; icon: LucideIcon }[] = [
  { key: "general", label: "Général", group: "Préférences", icon: SlidersHorizontal },
  { key: "profile", label: "Profil", group: "Préférences", icon: UserRound },
  { key: "follow-ups", label: "Relances", group: "Préférences", icon: CalendarClock },
  { key: "appearance", label: "Apparence", group: "Préférences", icon: Palette },
  { key: "pipelines", label: "Statuts et pipelines", group: "Suivi", icon: Workflow },
  { key: "templates", label: "Modèles de checklist", group: "Suivi", icon: ListChecks },
  { key: "emails", label: "Modèles d’e-mails", group: "Suivi", icon: Mail },
  { key: "automation", label: "Automatisations", group: "Suivi", icon: Zap },
  { key: "tags", label: "Tags", group: "Suivi", icon: Tags },
  { key: "views", label: "Vues enregistrées", group: "Suivi", icon: Bookmark },
  { key: "goals", label: "Objectifs", group: "Suivi", icon: Target },
  { key: "ai", label: "IA et Claude", group: "Système", icon: Sparkles },
  { key: "documents", label: "Documents", group: "Système", icon: FolderOpen },
  { key: "data", label: "Données et sauvegardes", group: "Système", icon: DatabaseBackup },
  { key: "integrations", label: "Intégrations et API", group: "Système", icon: Plug },
];

export function SettingsShell({ section, children }: { section: string; children: React.ReactNode }) {
  const groups = [...new Set(SETTINGS_NAV.map((n) => n.group))];
  return (
    <PageContainer wide>
      <PageHeader title="Paramètres" />
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Sections des paramètres" className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-3 md:overflow-visible md:px-0 md:pb-0">
          {groups.map((group) => (
            <div key={group} className="flex shrink-0 gap-0.5 md:flex-col">
              <p className="hidden px-2 pt-3 pb-1 text-xs font-semibold text-faint uppercase md:block">{group}</p>
              {SETTINGS_NAV.filter((n) => n.group === group).map((n) => {
                const active = section === n.key;
                return (
                  <Link
                    key={n.key}
                    href={`/settings/${n.key}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-lg p-2 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                      active ? "bg-selected text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
                    )}
                  >
                    <n.icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-faint")} aria-hidden />
                    <span className="truncate">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl">{children}</div>
      </div>
    </PageContainer>
  );
}

export function SettingsCard({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className="mb-5 surface">
      <div className="border-b border-separator px-5 py-4">
        <h2 className="heading-base text-foreground">{title}</h2>
        {description && <p className="mt-0.5 copy-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 px-5 py-5">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-separator px-5 py-3">{footer}</div>}
    </section>
  );
}
