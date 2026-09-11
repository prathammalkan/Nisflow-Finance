import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6",
        className
      )}
      {...props}
    >
      <div className="space-y-0.5">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(actions || children) && (
        <div className="flex items-center gap-2">
          {actions}
          {children}
        </div>
      )}
    </div>
  )
}
