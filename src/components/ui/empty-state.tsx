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
        "flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in-50",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4" aria-hidden="true">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 mb-4 text-sm text-muted-foreground max-w-sm mx-auto">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Button asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      {actionLabel && onAction && !actionHref && (
        <Button onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
