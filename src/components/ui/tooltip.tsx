"use client"
import * as React from "react"
import { cn } from "@/lib/utils"

const TooltipContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

export function Tooltip({
  children,
  delayDuration = 300,
}: {
  children: React.ReactNode
  delayDuration?: number
}) {
  const [open, setOpen] = React.useState(false)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setOpen(true), delayDuration)
  }, [delayDuration])

  const handleMouseLeave = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpen(false)
  }, [])

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

export const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => {
  const child = asChild ? React.Children.only(children) as React.ReactElement : null

  if (asChild && child) {
    return React.cloneElement(child as React.ReactElement<any>, {
      ref,
      ...((child as React.ReactElement<any>).props),
      ...props
    })
  }

  return (
    <button ref={ref} {...props}>
      {children}
    </button>
  )
})
TooltipTrigger.displayName = "TooltipTrigger"

export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { side?: "top" | "bottom" | "left" | "right" }
>(({ className, side = "top", children, ...props }, ref) => {
  const ctx = React.useContext(TooltipContext)
  if (!ctx) throw new Error("TooltipContent must be used within Tooltip")

  if (!ctx.open) return null

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        side === "top" && "bottom-full left-1/2 -translate-x-1/2 -translate-y-2",
        side === "bottom" && "top-full left-1/2 -translate-x-1/2 translate-y-2",
        side === "left" && "right-full top-1/2 -translate-y-1/2 -translate-x-2",
        side === "right" && "left-full top-1/2 -translate-y-1/2 translate-x-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
TooltipContent.displayName = "TooltipContent"
