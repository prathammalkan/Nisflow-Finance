import * as React from "react"
import { LucideIcon } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-8 text-center",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-muted mb-4" aria-hidden="true">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 mb-5 text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Button asChild size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      {actionLabel && onAction && !actionHref && (
        <Button onClick={onAction} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
