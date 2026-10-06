"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

/** Safe Markdown (no raw HTML), external links open in a new tab. */
export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children?.trim()) return null;
  return (
    <div className={cn("prose-cos", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minRows = 8,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  return (
    <div className={cn("rounded-lg border", className)}>
      <div className="flex items-center gap-1 border-b border-separator px-2 py-1 text-xs">
        {(["write", "preview"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("rounded px-2 py-0.5 capitalize", mode === m ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {m}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">Markdown supported</span>
      </div>
      {mode === "write" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          className="min-h-32 resize-y rounded-none border-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-32 p-3">{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}</div>
      )}
    </div>
  );
}
