import { cn } from "cn"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-md border border-border bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground shadow-[0_1px_0_0_var(--border)] select-none in-data-[slot=tooltip-content]:border-transparent in-data-[slot=tooltip-content]:bg-white/10 in-data-[slot=tooltip-content]:text-primary-200 in-data-[slot=tooltip-content]:shadow-none dark:bg-stone-800 [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
