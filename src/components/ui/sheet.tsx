"use client"
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const SheetContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
} | null>(null)

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>
  )
}

export const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(SheetContext)
  if (!ctx) throw new Error("SheetTrigger must be used within Sheet")

  const child = asChild ? React.Children.only(children) as React.ReactElement : null

  if (asChild && child) {
    return React.cloneElement(child as React.ReactElement<any>, {
      onClick: (e: any) => {
        (child as React.ReactElement<any>).props.onClick?.(e)
        onClick?.(e)
        ctx.onOpenChange(true)
      },
      ref,
      ...props
    })
  }

  return (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e)
        ctx.onOpenChange(true)
      }}
      {...props}
    >
      {children}
    </button>
  )
})
SheetTrigger.displayName = "SheetTrigger"

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof sheetVariants> {}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = "right", className, children, ...props }, ref) => {
    const ctx = React.useContext(SheetContext)
    if (!ctx) throw new Error("SheetContent must be used within Sheet")

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && ctx.open) {
          ctx.onOpenChange(false)
        }
      }
      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("keydown", handleKeyDown)
      }
    }, [ctx])

    if (!ctx.open) return null

    return (
      <div className="fixed inset-0 z-50">
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
          onClick={() => ctx.onOpenChange(false)}
        />
        <div
          ref={ref}
          className={cn(sheetVariants({ side }), className)}
          data-state={ctx.open ? "open" : "closed"}
          {...props}
        >
          {children}
        </div>
      </div>
    )
  }
)
SheetContent.displayName = "SheetContent"

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = "SheetTitle"

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = "SheetDescription"

export const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(SheetContext)
  if (!ctx) throw new Error("SheetClose must be used within Sheet")

  const child = asChild ? React.Children.only(children) as React.ReactElement : null

  if (asChild && child) {
    return React.cloneElement(child as React.ReactElement<any>, {
      onClick: (e: any) => {
        (child as React.ReactElement<any>).props.onClick?.(e)
        onClick?.(e)
        ctx.onOpenChange(false)
      },
      ref,
      ...props
    })
  }

  return (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e)
        ctx.onOpenChange(false)
      }}
      {...props}
    >
      {children}
    </button>
  )
})
SheetClose.displayName = "SheetClose"
