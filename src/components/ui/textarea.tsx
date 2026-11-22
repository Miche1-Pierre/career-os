import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-border-form bg-background px-3 py-2 text-base text-foreground transition-colors outline-none placeholder:text-faint focus-visible:border-border-form-active disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-faint aria-invalid:border-warning-500 aria-invalid:focus-visible:border-warning-600 md:text-sm dark:bg-transparent dark:disabled:bg-foreground/5",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
