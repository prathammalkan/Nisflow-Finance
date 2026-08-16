"use client"
import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const DialogContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
} | null>(null)

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  )
}

export const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("DialogTrigger must be used within Dialog")

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
DialogTrigger.displayName = "DialogTrigger"

export const DialogContent = React.forwardRef<
  HTMLDialogElement,
  React.DialogHTMLAttributes<HTMLDialogElement>
>(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("DialogContent must be used within Dialog")

  const dialogRef = React.useRef<HTMLDialogElement>(null)

  React.useImperativeHandle(ref, () => dialogRef.current as HTMLDialogElement)

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (ctx.open && !dialog.open) {
      dialog.showModal()
    } else if (!ctx.open && dialog.open) {
      dialog.close()
    }
  }, [ctx.open])

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e: Event) => {
      e.preventDefault()
      ctx.onOpenChange(false)
    }

    const handleClick = (e: MouseEvent) => {
      const rect = dialog.getBoundingClientRect()
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      if (!isInDialog) {
        ctx.onOpenChange(false)
      }
    }

    dialog.addEventListener("cancel", handleCancel)
    dialog.addEventListener("click", handleClick)

    return () => {
      dialog.removeEventListener("cancel", handleCancel)
      dialog.removeEventListener("click", handleClick)
    }
  }, [ctx.onOpenChange])

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 backdrop:bg-black/80 backdrop:backdrop-blur-sm sm:rounded-lg animate-in fade-in-0 zoom-in-95",
        !ctx.open && "hidden",
        className
      )}
      {...props}
    >
      {children}
      <button
        onClick={() => ctx.onOpenChange(false)}
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
    </dialog>
  )
})
DialogContent.displayName = "DialogContent"

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ asChild, children, onClick, ...props }, ref) => {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error("DialogClose must be used within Dialog")

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
DialogClose.displayName = "DialogClose"
