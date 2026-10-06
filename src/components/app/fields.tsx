"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagBadge, ProvenanceMark } from "./badges";
import { useAppData } from "./app-data";
import type { FieldProvenance } from "@/lib/schemas";

/** Label + control + optional provenance marker and hint. */
export function FormField({
  label,
  htmlFor,
  hint,
  provenance,
  className,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  provenance?: FieldProvenance | null;
  className?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
        <ProvenanceMark provenance={provenance} />
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Chip input with suggestions from existing tags. Enter / comma to add, Backspace to remove. */
export function TagInput({ value, onChange, placeholder = "Add a tag…", suggestions: extra }: { value: string[]; onChange: (tags: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const { tags } = useAppData();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => {
    const pool = [...new Set([...(extra ?? []), ...tags.map((t) => t.name)])];
    const q = draft.trim().toLowerCase();
    return pool.filter((t) => !value.some((v) => v.toLowerCase() === t.toLowerCase()) && (!q || t.toLowerCase().includes(q))).slice(0, 8);
  }, [tags, extra, draft, value]);
  const add = (tag: string) => {
    const t = tag.trim().replace(/^#/, "");
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className="relative">
      <div
        className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <TagBadge key={tag} name={tag} onRemove={() => onChange(value.filter((v) => v !== tag))} />
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 150);
            if (draft.trim()) add(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          placeholder={value.length ? "" : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 flex w-full flex-wrap gap-1 rounded-lg border bg-popover p-2 shadow-md">
          {suggestions.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="rounded">
              <TagBadge name={s} className="cursor-pointer hover:opacity-80" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-line list editor: one item per line (fast to paste into). */
export function ListEditor({ value, onChange, placeholder, rows = 4, id }: { value: string[]; onChange: (items: string[]) => void; placeholder?: string; rows?: number; id?: string }) {
  const [text, setText] = useState(value.join("\n"));
  const [synced, setSynced] = useState(value);
  if (synced !== value && value.join("\n") !== text.split("\n").map((l) => l.trim()).filter(Boolean).join("\n")) {
    setSynced(value);
    setText(value.join("\n"));
  }
  return (
    <Textarea
      id={id}
      value={text}
      rows={Math.max(rows, Math.min(12, value.length + 1))}
      placeholder={placeholder ?? "One item per line"}
      onChange={(e) => {
        setText(e.target.value);
        const items = e.target.value
          .split("\n")
          .map((l) => l.replace(/^[\s•\-–*·]+/, "").trim())
          .filter(Boolean);
        setSynced(items);
        onChange(items);
      }}
      className="text-sm"
    />
  );
}

export function DateInput({ value, onChange, id, className, min, max }: { value: string | null | undefined; onChange: (value: string | null) => void; id?: string; className?: string; min?: string; max?: string }) {
  return <Input id={id} type="date" value={value ?? ""} min={min} max={max} onChange={(e) => onChange(e.target.value || null)} className={cn("w-full tabular-nums", className)} />;
}

export function TimeInput({ value, onChange, id, className }: { value: string | null | undefined; onChange: (value: string | null) => void; id?: string; className?: string }) {
  return <Input id={id} type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={cn("w-full tabular-nums", className)} />;
}

export function NumberInput({ value, onChange, id, placeholder, className, step }: { value: number | null | undefined; onChange: (value: number | null) => void; id?: string; placeholder?: string; className?: string; step?: number }) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={cn("w-full tabular-nums", className)}
    />
  );
}
