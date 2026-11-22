"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, Globe, Loader2, Sparkles, Type, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Kbd } from "@/components/ui/kbd";
import { captureAction } from "@/app/actions/inbox";
import { useAppData } from "./app-data";

interface QuickImportContextValue {
  open: (initial?: { text?: string; url?: string }) => void;
}

const QuickImportContext = createContext<QuickImportContextValue | null>(null);

export function useQuickImport() {
  const ctx = useContext(QuickImportContext);
  if (!ctx) throw new Error("useQuickImport must be used inside QuickImportProvider");
  return ctx;
}

const ACCEPT = ".pdf,.docx,.txt,.md,.html,.htm,.eml";

export function QuickImportProvider({ children }: { children: React.ReactNode }) {
  const { ai, badges } = useAppData();
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [tab, setTab] = useState<"text" | "url" | "file">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analyze, setAnalyze] = useState(ai.available);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Follow AI availability changes (adjusting state during render, not in an effect).
  const [aiAvailable, setAiAvailable] = useState(ai.available);
  if (aiAvailable !== ai.available) {
    setAiAvailable(ai.available);
    setAnalyze(ai.available);
  }

  const open = useCallback((initial?: { text?: string; url?: string }) => {
    setText(initial?.text ?? "");
    setUrl(initial?.url ?? "");
    setFile(null);
    setTab(initial?.url ? "url" : "text");
    setOpen(true);
  }, []);

  const canSubmit = (tab === "text" && text.trim().length > 0) || (tab === "url" && /^https?:\/\//i.test(url.trim())) || (tab === "file" && !!file);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const form = new FormData();
    if (tab === "text") form.set("text", text);
    if (tab === "url") form.set("url", url.trim());
    if (tab === "file" && file) form.set("file", file);
    form.set("analyze", String(analyze && ai.available));
    try {
      const result = await captureAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      if (result.data.duplicate) toast.info("Déjà importé : ouverture de l'élément existant.");
      else toast.success(result.data.status === "QUEUED" ? "Importé : Claude l'analyse…" : "Importé dans « À trier »");
      router.push(`/inbox/${result.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <QuickImportContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-2xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => textRef.current?.focus(), 30);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) {
              setFile(dropped);
              setTab("file");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Import rapide</DialogTitle>
            <DialogDescription>
              Colle n’importe quoi : une offre, une page de formation, un email de recruteur, des notes. Tout arrive dans « À trier » et tu valides avant que quoi que ce soit soit créé.
              {badges.inbox > 0 && (
                <Link href="/inbox" onClick={() => setOpen(false)} className="ml-1 text-highlight-600 hover:underline">
                  {badges.inbox} élément{badges.inbox > 1 ? "s" : ""} à trier
                </Link>
              )}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="text">
                <Type /> Texte
              </TabsTrigger>
              <TabsTrigger value="url">
                <Globe /> URL
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileUp /> Fichier
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="h-[19.5rem]">
              <Textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Colle ici une offre, une description de formation, un email, un message LinkedIn ou des notes…"
                className="h-72 resize-none text-sm leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">{text.length ? `${text.length.toLocaleString("fr-FR")} caractères` : "Astuce : une URL seule collée ici est récupérée automatiquement."}</p>
            </TabsContent>
            <TabsContent value="url" className="h-[19.5rem] space-y-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && void submit()} autoFocus />
              <p className="text-xs text-muted-foreground">Career OS récupère la page (et ses données structurées quand elles existent). Les sites avec connexion (LinkedIn…) bloquent la récupération : colle plutôt le texte.</p>
            </TabsContent>
            <TabsContent value="file" className="h-[19.5rem]">
              <label className={`flex h-72 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm ${dragging ? "border-primary bg-primary/5" : "text-muted-foreground"}`}>
                <FileUp className="size-6" />
                {file ? (
                  <span className="flex items-center gap-2 text-foreground">
                    {file.name} <span className="text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
                    <button type="button" onClick={(e) => (e.preventDefault(), setFile(null))} aria-label="Retirer le fichier">
                      <X className="size-4" />
                    </button>
                  </span>
                ) : (
                  <span>Dépose un fichier ou clique : PDF, DOCX, TXT, MD, HTML, EML</span>
                )}
                <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </TabsContent>
          </Tabs>
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch id="qi-analyze" checked={analyze && ai.available} disabled={!ai.available} onCheckedChange={setAnalyze} />
              <Label htmlFor="qi-analyze" className="text-xs">
                <Sparkles className="size-3.5 text-highlight-500" />
                {ai.available ? "Analyser avec l'IA maintenant" : "IA non configurée : demande à Claude de traiter « À trier »"}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button onClick={submit} disabled={!canSubmit || submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                Importer
                <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground">Ctrl ↵</Kbd>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </QuickImportContext.Provider>
  );
}
