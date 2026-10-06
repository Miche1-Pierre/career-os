"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Eye, FileText, Folder, Plus, RefreshCw, ScanSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { TagList } from "@/components/app/badges";
import { ListIcon, SectionHeader } from "@/components/app/sparkle";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { useAppData } from "@/components/app/app-data";
import { DOCUMENT_KINDS, DOCUMENT_KIND_META, type DocumentKind } from "@/lib/constants";
import { formatISODate } from "@/lib/dates";
import { normalizeText } from "@/lib/text";
import type { DocumentListItem, FileStatus } from "@/server/services/documents";
import { NewDocumentDialog, NewVersionDialog, ScanLibraryDialog } from "./document-dialogs";
import { cn } from "@/lib/utils";

export const FILE_STATUS: Record<FileStatus, { label: string; className: string; hint: string }> = {
  ok: { label: "File OK", className: "text-emerald-700 dark:text-emerald-300", hint: "The file matches the registered version." },
  modified: { label: "Modified", className: "text-info-800", hint: "The file changed since this version was registered — create a new version to keep both." },
  missing: { label: "Missing", className: "text-warning-600", hint: "The file is no longer in the folder and no snapshot exists." },
  external: { label: "Reference only", className: "text-muted-foreground", hint: "Outside the documents folder: Career OS only keeps the path." },
  snapshot_only: { label: "Snapshot only", className: "text-sky-600 dark:text-sky-400", hint: "The original file moved or was deleted — the frozen copy is still available." },
};

const GROUPS: { title: string; kinds: DocumentKind[] }[] = [
  { title: "CV", kinds: ["CV"] },
  { title: "Cover & motivation letters", kinds: ["COVER_LETTER"] },
  { title: "Academic", kinds: ["TRANSCRIPT", "DIPLOMA", "RECOMMENDATION"] },
  { title: "Certificates", kinds: ["CERTIFICATE", "LANGUAGE_CERT"] },
  { title: "Portfolio & presentations", kinds: ["PORTFOLIO", "PRESENTATION"] },
  { title: "Other", kinds: ["ID_DOCUMENT", "OTHER"] },
];

export function DocumentsLibrary({ docs, library, openNew, showArchived }: { docs: DocumentListItem[]; library: { root: string; hostRoot: string; exists: boolean; writable: boolean }; openNew?: boolean; showArchived: boolean }) {
  const router = useRouter();
  const { dateLocale } = useAppData();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(!!openNew);
  const [scanning, setScanning] = useState(false);
  const [versionFor, setVersionFor] = useState<{ id: string; path: string | null } | null>(null);
  const filtered = useMemo(() => {
    const n = normalizeText(q);
    return n ? docs.filter((d) => normalizeText(`${d.name} ${d.tags.join(" ")} ${DOCUMENT_KIND_META[d.kind].label} ${d.latest?.fileName ?? ""}`).includes(n)) : docs;
  }, [docs, q]);
  void DOCUMENT_KINDS;

  return (
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Your CVs, letters and certificates — versioned, with the exact version used for each application."
        actions={
          <>
            <Button variant="outline" onClick={() => setScanning(true)} disabled={!library.exists}>
              <ScanSearch /> Scan folder
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add document
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 surface p-3 text-sm sm:flex-row sm:items-center">
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{library.hostRoot}</span>
        <span className={cn("flex items-center gap-1 text-xs", library.exists ? "text-emerald-700 dark:text-emerald-300" : "text-warning-500")}>
          {library.exists ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {library.exists ? (library.writable ? "Connected" : "Connected (read-only)") : "Folder not mounted"}
        </span>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter documents…" className="h-8 pl-8" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="arch" size="sm" checked={showArchived} onCheckedChange={(v) => router.push(v ? "/documents?archived=1" : "/documents")} />
          <Label htmlFor="arch" className="text-xs text-muted-foreground">
            Show archived
          </Label>
        </div>
      </div>
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No document yet" description="Add your CVs and letters, or scan your documents folder to register what is already there.">
          <div className="flex gap-2">
            <Button onClick={() => setAdding(true)}>Add document</Button>
            <Button variant="outline" onClick={() => setScanning(true)} disabled={!library.exists}>
              Scan folder
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => {
            const items = filtered.filter((d) => group.kinds.includes(d.kind));
            if (!items.length) return null;
            return (
              <section key={group.title} className="space-y-3">
                <SectionHeader title={group.title} count={items.length} />
                <ul className="surface-list">
                  {items.map((d) => {
                    const status = d.latest?.fileStatus ?? "missing";
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted-background">
                        <ListIcon icon={FileText} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/documents/${d.id}`} className="text-sm font-medium text-foreground hover:underline">
                              {d.name}
                            </Link>
                            {d.latest && <Badge size="sm" className="tabular-nums">v{d.latest.version}</Badge>}
                            {d.archivedAt && <span className="text-[10px] text-muted-foreground">archived</span>}
                            {d.isDemo && <span className="rounded-md bg-info-50 px-1 text-[10px] font-medium text-info-800">demo</span>}
                            <TagList tags={d.tags} max={3} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.latest ? `${d.latest.fileName ?? ""} · ${formatISODate(String(d.latest.createdAt).slice(0, 10), "medium", dateLocale)}${d.latest.label ? ` · ${d.latest.label}` : ""}` : "No version"}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground tabular-nums">{d.usageCount ? `Used by ${d.usageCount} application${d.usageCount > 1 ? "s" : ""}` : "Unused"}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn("text-xs font-medium", FILE_STATUS[status].className)}>{FILE_STATUS[status].label}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-64">{FILE_STATUS[status].hint}</TooltipContent>
                        </Tooltip>
                        {status === "modified" && d.latest && (
                          <Button size="xs" variant="outline" onClick={() => setVersionFor({ id: d.id, path: d.latest!.relativePath })}>
                            <RefreshCw /> New version
                          </Button>
                        )}
                        {d.latest && d.latest.storage !== "EXTERNAL" && (
                          <Button size="icon-xs" variant="ghost-secondary" asChild>
                            <a href={`/api/files/versions/${d.latest.id}?source=current`} target="_blank" rel="noopener noreferrer" aria-label="Open">
                              <Eye />
                            </a>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {adding && <NewDocumentDialog open={adding} onOpenChange={setAdding} libraryHostRoot={library.hostRoot} />}
      {scanning && <ScanLibraryDialog open={scanning} onOpenChange={setScanning} />}
      {versionFor && <NewVersionDialog documentId={versionFor.id} defaultPath={versionFor.path} open={!!versionFor} onOpenChange={(o) => !o && setVersionFor(null)} />}
    </PageContainer>
  );
}
