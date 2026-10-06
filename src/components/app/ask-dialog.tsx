"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { applyActionsAction, interpretCommandAction } from "@/app/actions/opportunities";
import type { CommandResult } from "@/server/ai/prompts";
import { Markdown } from "./markdown";

interface AskContextValue {
  open: (text?: string) => void;
}
const AskContext = createContext<AskContextValue | null>(null);
export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}

type Operation = CommandResult["operations"][number];

/** Maps an interpreted operation to a server action payload (executed only after confirmation). */
function toAction(op: Operation): Record<string, unknown> | null {
  const id = op.opportunityId;
  switch (op.type) {
    case "SET_STATUS":
      return id && op.status ? { type: "SET_STATUS", opportunityId: id, status: op.status, date: op.date } : null;
    case "SCHEDULE_FOLLOW_UP":
      return id ? { type: "SCHEDULE_FOLLOW_UP", opportunityId: id, date: op.date, days: op.days } : null;
    case "MARK_FOLLOW_UP_DONE":
      return id ? { type: "FOLLOW_UP_DONE", opportunityId: id, date: op.date } : null;
    case "ADD_INTERVIEW":
      return id ? { type: "ADD_INTERVIEW", opportunityId: id, kind: op.interviewKind ?? "OTHER", date: op.date, time: op.time, notes: op.text } : null;
    case "ADD_TASK":
      return op.text ? { type: "ADD_TASK", opportunityId: id, title: op.text, dueDate: op.date } : null;
    case "ADD_NOTE":
      return op.text ? { type: "LOG_EVENT", opportunityId: id, eventType: "NOTE", title: "Note", body: op.text } : null;
    case "ADD_REQUIRED_DOCUMENT":
      return id && op.text ? { type: "ADD_REQUIRED_DOCUMENT", opportunityId: id, text: op.text } : null;
    case "SET_DEADLINE":
      return id && op.date ? { type: "SET_DEADLINE", opportunityId: id, date: op.date, time: op.time } : null;
    case "SET_PRIORITY":
      return id && op.priority ? { type: "SET_PRIORITY", opportunityId: id, priority: op.priority } : null;
    default:
      return null;
  }
}

export function AskProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(CommandResult & { model: string | null }) | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<{ ok: boolean; message: string }[] | null>(null);

  const interpret = useCallback(async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setResult(null);
    setOutcomes(null);
    const r = await interpretCommandAction(value);
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setResult(r.data);
    setSelected(new Set(r.data.operations.map((_, i) => i).filter((i) => r.data.operations[i].type !== "ANSWER" && r.data.operations[i].type !== "NAVIGATE")));
  }, []);

  const open = useCallback(
    (initial?: string) => {
      setText(initial ?? "");
      setResult(null);
      setOutcomes(null);
      setOpen(true);
      if (initial?.trim()) void interpret(initial);
    },
    [interpret],
  );

  async function apply() {
    if (!result) return;
    const ops = result.operations.filter((_, i) => selected.has(i));
    const navigate = ops.find((o) => o.type === "NAVIGATE" && o.path);
    const actions = ops.map(toAction).filter(Boolean) as Record<string, unknown>[];
    if (actions.length) {
      setApplying(true);
      const r = await applyActionsAction(actions);
      setApplying(false);
      if (!r.ok) return void toast.error(r.error);
      setOutcomes(r.data);
      if (r.data.every((o) => o.ok)) toast.success(`${r.data.length} change${r.data.length > 1 ? "s" : ""} applied`);
    }
    if (navigate?.path?.startsWith("/")) {
      setOpen(false);
      router.push(navigate.path);
    }
  }

  return (
    <AskContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-highlight-500" /> Ask Career OS
            </DialogTitle>
            <DialogDescription>Ask a question about your data or give an instruction (“Ajoute une relance à Zefir dans 5 jours”). Changes are always shown for confirmation first.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Quelles candidatures nécessitent une action cette semaine ?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void interpret(text);
              }
            }}
          />
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Thinking…
            </div>
          )}
          {result && (
            <div className="space-y-3">
              {result.answer && (
                <div className="rounded-lg bg-muted-background p-3">
                  <Markdown>{result.answer}</Markdown>
                  {result.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      Sources:
                      {result.citations.map((c) => (
                        <Link key={c.opportunityId} href={`/applications/${c.opportunityId}`} onClick={() => setOpen(false)} className="text-primary underline underline-offset-2">
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {result.needsClarification && <p className="text-sm text-info-800">{result.needsClarification}</p>}
              {result.operations.filter((o) => o.type !== "ANSWER").length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Proposed changes</div>
                  {result.operations.map((op, i) =>
                    op.type === "ANSWER" ? null : (
                      <label key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                        <Checkbox
                          checked={selected.has(i)}
                          onCheckedChange={(v) => setSelected((s) => {
                            const next = new Set(s);
                            if (v) next.add(i);
                            else next.delete(i);
                            return next;
                          })}
                        />
                        <span>
                          {op.summary}
                          <span className="block text-xs text-muted-foreground">{op.type.toLowerCase().replace(/_/g, " ")}</span>
                        </span>
                        {outcomes?.[i] &&
                          (outcomes[i].ok ? <CheckCircle2 className="ml-auto size-4 text-emerald-500" /> : <XCircle className="ml-auto size-4 text-warning-500" />)}
                      </label>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            {result && result.operations.some((o) => o.type !== "ANSWER") ? (
              <Button onClick={apply} disabled={applying || selected.size === 0}>
                {applying && <Loader2 className="animate-spin" />} Apply selected
              </Button>
            ) : (
              <Button onClick={() => interpret(text)} disabled={loading || !text.trim()}>
                {loading && <Loader2 className="animate-spin" />} Ask
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AskContext.Provider>
  );
}
