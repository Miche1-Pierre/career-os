"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Bot, FileText, Globe, Inbox as InboxIcon, Plug, Sparkles, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ListIcon } from "@/components/app/sparkle";
import { useAppData } from "@/components/app/app-data";
import { useQuickImport } from "@/components/app/quick-import";
import { useConfirm } from "@/components/app/confirm";
import { useAction } from "@/hooks/use-action";
import { analyzeInboxAction, archiveInboxAction, deleteInboxAction } from "@/app/actions/inbox";
import { formatRelativeInstant } from "@/lib/dates";
import type { InboxKind, InboxStatus } from "@/lib/constants";
import { InboxKindBadge, InboxStatusBadge } from "./inbox-bits";

export interface InboxListItem {
  id: string;
  status: InboxStatus;
  kind: InboxKind;
  title: string | null;
  sourceType: string;
  sourceUrl: string | null;
  fileName: string | null;
  preview: string;
  error: string | null;
  resultMeta: { provider?: string; model?: string | null; by?: string } | null;
  convertedType: string | null;
  convertedId: string | null;
  createdAt: string;
  isDemo: boolean;
}

const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = { PASTE: Type, URL: Globe, FILE: FileText, MCP: Bot, API: Plug, EXTENSION: Globe, EMAIL: InboxIcon };

export function InboxList({ items, view }: { items: InboxListItem[]; view: "active" | "converted" | "archived" }) {
  const router = useRouter();
  const { ai } = useAppData();
  const quickImport = useQuickImport();
  const confirm = useConfirm();
  const { run } = useAction();
  const busy = items.some((i) => i.status === "QUEUED" || i.status === "PROCESSING");

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [busy, router]);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="À trier"
        description="Tout ce que vous capturez arrive d’abord ici. Vérifiez, puis transformez en emploi, formation, contact ou note."
        actions={
          <Button onClick={() => quickImport.open()}>
            <Sparkles /> Import rapide
          </Button>
        }
      />
      <Tabs value={view} onValueChange={(v) => router.push(v === "active" ? "/inbox" : `/inbox?view=${v}`)} className="mb-4">
        <TabsList>
          <TabsTrigger value="active">À traiter</TabsTrigger>
          <TabsTrigger value="converted">Traités</TabsTrigger>
          <TabsTrigger value="archived">Archivés</TabsTrigger>
        </TabsList>
      </Tabs>
      {view === "active" && !ai.available && items.some((i) => i.status === "NEW") && (
        <div className="mb-4 rounded-2xl bg-highlight-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Bot className="size-4 text-highlight-500" /> Confier ces captures à Claude Code
          </p>
          <p className="mt-1 text-muted-foreground">
            L’IA intégrée est désactivée. Ouvrez Claude Code dans <code className="rounded bg-background px-1">C:\Candidature</code> et dites <span className="font-medium text-foreground">« traite mon inbox Career OS »</span> — les résultats reviennent ici, prêts à être vérifiés.
          </p>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={InboxIcon} title={view === "active" ? "Rien à trier" : "Rien ici"} description={view === "active" ? "Collez une offre, une page de formation, un e-mail ou des notes avec l’import rapide (I)." : undefined}>
          {view === "active" && (
            <Button variant="highlight" onClick={() => quickImport.open()}>
              Import rapide
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="surface-list">
          {items.map((item) => {
            const Icon = SOURCE_ICON[item.sourceType] ?? Type;
            const href = item.status === "CONVERTED" && item.convertedType === "opportunity" && item.convertedId ? `/applications/${item.convertedId}` : `/inbox/${item.id}`;
            return (
              <li key={item.id} className="group flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-muted-background">
                <ListIcon icon={Icon} tone={item.status === "READY" ? "success" : item.status === "FAILED" ? "warning" : item.status === "QUEUED" || item.status === "PROCESSING" ? "highlight" : undefined} />
                <Link href={href} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{item.title || "Capture sans titre"}</span>
                    <InboxKindBadge kind={item.kind} />
                    <InboxStatusBadge status={item.status} />
                    {item.isDemo && <span className="rounded-md bg-info-50 px-1 text-[10px] font-medium text-info-800">démo</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 copy-sm text-muted-foreground">{item.status === "FAILED" && item.error ? item.error : item.preview}</p>
                  <p className="mt-1.5 text-xs text-faint">
                    {formatRelativeInstant(item.createdAt)}
                    {item.fileName ? ` · ${item.fileName}` : item.sourceUrl ? ` · ${item.sourceUrl.replace(/^https?:\/\//, "").slice(0, 60)}` : ""}
                    {item.resultMeta?.by ? ` · analysé par ${item.resultMeta.by === "CLAUDE" ? "Claude (MCP)" : item.resultMeta.provider}` : ""}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {(item.status === "NEW" || item.status === "FAILED") && ai.available && (
                    <Button size="xs" variant="outline" onClick={() => run(() => analyzeInboxAction(item.id), { success: "Analyse lancée" })}>
                      <Sparkles /> Analyser
                    </Button>
                  )}
                  {item.status === "READY" && (
                    <Button size="xs" asChild>
                      <Link href={`/inbox/${item.id}`}>Vérifier</Link>
                    </Button>
                  )}
                  {view !== "archived" && (
                    <Button size="icon-xs" variant="ghost-secondary" aria-label="Archiver" onClick={() => run(() => archiveInboxAction(item.id), { success: "Archivé" })}>
                      <Archive />
                    </Button>
                  )}
                  <Button
                    size="icon-xs"
                    variant="ghost-secondary"
                    aria-label="Supprimer"
                    onClick={async () => {
                      if (await confirm({ title: "Supprimer définitivement cette capture ?", description: "Le texte brut sera perdu. Les opportunités créées à partir d’elle sont conservées.", destructive: true, confirmLabel: "Supprimer" }))
                        run(() => deleteInboxAction(item.id), { success: "Supprimé" });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
