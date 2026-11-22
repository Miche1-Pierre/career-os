"use client";

import { Briefcase, Building2, FileText, RotateCcw, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { purgeOpportunityAction, restoreOpportunityAction } from "@/app/actions/opportunities";
import { purgeContactAction, purgeOrganizationAction, restoreContactAction, restoreOrganizationAction } from "@/app/actions/network";
import { purgeDocumentAction, restoreDocumentAction } from "@/app/actions/documents";
import { formatRelativeInstant } from "@/lib/dates";

type Item = { type: "opportunity" | "organization" | "contact" | "document"; id: string; title: string; subtitle: string | null; deletedAt: string | null };

const ICON = { opportunity: Briefcase, organization: Building2, contact: User, document: FileText };
const TYPE_LABEL = { opportunity: "Opportunité", organization: "Organisation", contact: "Contact", document: "Document" };
const RESTORE = { opportunity: restoreOpportunityAction, organization: restoreOrganizationAction, contact: restoreContactAction, document: restoreDocumentAction };
const PURGE = { opportunity: purgeOpportunityAction, organization: purgeOrganizationAction, contact: purgeContactAction, document: purgeDocumentAction };

export function TrashView({ items }: { items: Item[] }) {
  const { run } = useAction();
  const confirm = useConfirm();
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Corbeille" description="Les éléments supprimés restent ici jusqu’à leur suppression définitive. Les fichiers des documents sur le disque ne sont jamais supprimés." />
      {items.length === 0 ? (
        <EmptyState icon={Trash2} title="La corbeille est vide" />
      ) : (
        <ul className="surface-list">
          {items.map((item) => {
            const Icon = ICON[item.type];
            return (
              <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Icon className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[item.type]}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                    {item.deletedAt ? ` · supprimé ${formatRelativeInstant(item.deletedAt)}` : ""}
                  </p>
                </div>
                <Button size="xs" variant="outline" onClick={() => run(() => RESTORE[item.type](item.id), { success: "Restauré" })}>
                  <RotateCcw /> Restaurer
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-destructive"
                  onClick={async () => {
                    if (await confirm({ title: `Supprimer définitivement « ${item.title} » ?`, description: "Action irréversible (vos exports et sauvegardes le contiennent encore).", destructive: true, confirmLabel: "Supprimer définitivement" }))
                      run(() => PURGE[item.type](item.id), { success: "Supprimé définitivement" });
                  }}
                >
                  <Trash2 /> Supprimer définitivement
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
