"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
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
  const { ai } = useAppData();
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
      if (result.data.duplicate) toast.info("Already captured — opening the existing item.");
      else toast.success(result.data.status === "QUEUED" ? "Captured — Claude is analyzing it…" : "Captured in your Inbox");
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
            <DialogTitle>Quick import</DialogTitle>
            <DialogDescription>Paste anything — a job posting, a program page, a recruiter email, notes. It lands in your Inbox and you review it before anything is created.</DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="text">
                <Type /> Paste text
              </TabsTrigger>
              <TabsTrigger value="url">
                <Globe /> URL
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileUp /> File
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text">
              <Textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste job / program description, email, LinkedIn message or notes here…"
                className="h-72 resize-none text-sm leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">{text.length ? `${text.length.toLocaleString()} characters` : "Tip: a bare URL pasted here is fetched automatically."}</p>
            </TabsContent>
            <TabsContent value="url" className="space-y-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" onKeyDown={(e) => e.key === "Enter" && void submit()} autoFocus />
              <p className="text-xs text-muted-foreground">Career OS fetches the page (and its structured data when available). Sites behind a login (LinkedIn…) block this: paste the text instead.</p>
            </TabsContent>
            <TabsContent value="file">
              <label className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm ${dragging ? "border-primary bg-primary/5" : "text-muted-foreground"}`}>
                <FileUp className="size-6" />
                {file ? (
                  <span className="flex items-center gap-2 text-foreground">
                    {file.name} <span className="text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
                    <button type="button" onClick={(e) => (e.preventDefault(), setFile(null))} aria-label="Remove file">
                      <X className="size-4" />
                    </button>
                  </span>
                ) : (
                  <span>Drop a file or click — PDF, DOCX, TXT, MD, HTML, EML</span>
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
                {ai.available ? "Analyze with AI now" : "AI not configured — ask Claude Code to process the inbox"}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSubmit || submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                Import
                <Kbd className="ml-1 bg-primary-foreground/15 text-primary-foreground">Ctrl ↵</Kbd>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </QuickImportContext.Provider>
  );
}
