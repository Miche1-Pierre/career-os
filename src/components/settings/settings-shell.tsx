import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

export const SETTINGS_NAV = [
  { key: "general", label: "General", group: "Preferences" },
  { key: "profile", label: "Profile", group: "Preferences" },
  { key: "follow-ups", label: "Follow-ups", group: "Preferences" },
  { key: "appearance", label: "Appearance", group: "Preferences" },
  { key: "pipelines", label: "Statuses & pipelines", group: "Workflow" },
  { key: "templates", label: "Checklist templates", group: "Workflow" },
  { key: "emails", label: "Email templates", group: "Workflow" },
  { key: "automation", label: "Automation", group: "Workflow" },
  { key: "tags", label: "Tags", group: "Workflow" },
  { key: "views", label: "Saved views", group: "Workflow" },
  { key: "goals", label: "Goals", group: "Workflow" },
  { key: "ai", label: "AI & Claude", group: "System" },
  { key: "documents", label: "Documents", group: "System" },
  { key: "data", label: "Data & backups", group: "System" },
  { key: "integrations", label: "Integrations & API", group: "System" },
] as const;

export function SettingsShell({ section, children }: { section: string; children: React.ReactNode }) {
  const groups = [...new Set(SETTINGS_NAV.map((n) => n.group))];
  return (
    <PageContainer wide>
      <PageHeader title="Settings" />
      <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-4 overflow-x-auto md:flex-col md:gap-3">
          {groups.map((group) => (
            <div key={group} className="flex shrink-0 gap-0.5 md:flex-col">
              <p className="hidden px-2 pt-3 pb-1 text-xs font-semibold text-faint uppercase md:block">{group}</p>
              {SETTINGS_NAV.filter((n) => n.group === group).map((n) => (
                <Link
                  key={n.key}
                  href={`/settings/${n.key}`}
                  className={cn(
                    "rounded-lg p-2 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                    section === n.key ? "bg-selected text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground",
                  )}
                >
                  {n.label}
                </Link>
              ))}
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
      {footer && <div className="flex justify-end gap-2 border-t border-separator px-5 py-3">{footer}</div>}
    </section>
  );
}
