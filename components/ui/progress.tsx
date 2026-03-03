"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-slate-200/50 relative h-3 w-full overflow-hidden rounded-full border border-white/60 shadow-inner-sm skeu-inset",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-gradient-to-r from-sky-400 to-teal-400 h-full w-full flex-1 transition-all rounded-full relative"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      >
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/30 rounded-full" />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
