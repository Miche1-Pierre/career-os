"use client"

import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

// Sparkle SliderToggle: recessed track, highlight blue when on, white knob.
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full shadow-[inset_0px_-3px_3px_0px_rgba(255,255,255,0.25),inset_0px_0.5px_2px_0px_rgba(0,0,0,0.14)] transition-colors duration-200 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[size=default]:h-5 data-[size=default]:w-8 data-[size=sm]:h-4 data-[size=sm]:w-6.5 data-checked:bg-highlight-400 data-unchecked:bg-slider-toggle-idle hover:data-unchecked:bg-primary-300 data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:data-checked:bg-highlight-500",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-white drop-shadow transition-transform duration-200 ease-in-out group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-unchecked:translate-x-[2px] group-data-[size=default]/switch:data-checked:translate-x-[14px] group-data-[size=sm]/switch:data-checked:translate-x-[12px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
