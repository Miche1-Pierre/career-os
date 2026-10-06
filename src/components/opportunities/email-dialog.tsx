"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { renderEmailAction } from "@/app/actions/opportunities";

interface Rendered {
  templates: { id: string; name: string }[];
  templateId: string | null;
  to: string | null;
  contactName: string | null;
  subject: string;
  body: string;
}

/** Drafts a follow-up / thank-you email from a template. Career OS never sends anything itself. */
export function EmailDialog({ opportunityId, open, onOpenChange, onSent }: { opportunityId: string; open: boolean; onOpenChange: (open: boolean) => void; onSent?: () => void }) {
  const [data, setData] = useState<Rendered | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    renderEmailAction(opportunityId, templateId).then((r) => {
      if (cancelled) return;
      if (!r.ok) return void toast.error(r.error);
      setData(r.data);
      setSubject(r.data.subject);
      setBody(r.data.body);
      setTo(r.data.to ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, opportunityId, templateId]);

  const copy = async (what: "subject" | "body") => {
    await navigator.clipboard.writeText(what === "subject" ? subject : body);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Draft email</DialogTitle>
          <DialogDescription>Edit, then copy or open it in your mail app. Career OS never sends emails on your behalf.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Preparing…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient email" />
              <Select value={data.templateId ?? undefined} onValueChange={setTemplateId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  {data.templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Button variant="outline" size="icon" onClick={() => copy("subject")} aria-label="Copy subject">
                {copied === "subject" ? <Check /> : <Copy />}
              </Button>
            </div>
            <div className="relative">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="text-sm" />
              <Button variant="outline" size="icon-sm" className="absolute top-2 right-2" onClick={() => copy("body")} aria-label="Copy body">
                {copied === "body" ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" asChild>
            <a href={mailto}>
              <Mail /> Open in mail app
            </a>
          </Button>
          {onSent && (
            <Button
              onClick={() => {
                onSent();
                onOpenChange(false);
              }}
            >
              <Check /> I sent it — log follow-up
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
