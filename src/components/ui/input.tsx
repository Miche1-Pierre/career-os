import * as React from "react"
import { cn } from "cn"

// Sparkle Input: white field, form border that darkens on focus (no glow), 12px radius.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-xl border border-border-form bg-background px-3 py-1 text-base text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-faint focus-visible:border-border-form-active disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-faint aria-invalid:border-warning-500 aria-invalid:focus-visible:border-warning-600 md:text-sm dark:bg-transparent dark:disabled:bg-foreground/5",
        className
      )}
      {...props}
    />
  )
}

export { Input }
