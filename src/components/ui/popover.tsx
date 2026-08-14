"use client"
import * as React from "react"
import { cn } from "@/lib/utils"

const PopoverContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

export function Popover({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  )
}

export const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(PopoverContext)
  if (!ctx) throw new Error("PopoverTrigger must be used within Popover")

  const child = asChild ? React.Children.only(children) as React.ReactElement : null

  if (asChild && child) {
    return React.cloneElement(child as React.ReactElement<any>, {
      ...props,
      ref: (node: HTMLElement) => {
        if (typeof ref === 'function') ref(node as any)
        else if (ref) ref.current = node as any
        
        const childRef = (child as any).ref
        if (typeof childRef === 'function') childRef(node)
        else if (childRef) childRef.current = node
      },
      onClick: (e: any) => {
        (child as React.ReactElement<any>).props.onClick?.(e)
        onClick?.(e)
        ctx.setOpen(!ctx.open)
      },
    })
  }

  return (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e)
        ctx.setOpen(!ctx.open)
      }}
      {...props}
    >
      {children}
    </button>
  )
})
PopoverTrigger.displayName = "PopoverTrigger"

export const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "center" | "end" }
>(({ className, align = "center", children, ...props }, ref) => {
  const ctx = React.useContext(PopoverContext)
  if (!ctx) throw new Error("PopoverContent must be used within Popover")

  const contentRef = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement)

  React.useEffect(() => {
    if (!ctx.open) return

    const handleClickOutside = (event: MouseEvent) => {
      const parent = contentRef.current?.closest(".relative")
      if (parent && !parent.contains(event.target as Node)) {
        ctx.setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        ctx.setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [ctx])

  if (!ctx.open) return null

  return (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-50 mt-2 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        align === "end" && "right-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "start" && "left-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
PopoverContent.displayName = "PopoverContent"
