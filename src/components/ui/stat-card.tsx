import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface StatCardProps {
  title: string
  value: string
  icon: LucideIcon
  change?: number
  changeLabel?: string
  className?: string
}

export function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel = "from last month",
  className,
}: StatCardProps) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-tabular-nums">{value}</div>
        {change !== undefined && (
          <p className="mt-1 flex items-center text-xs text-muted-foreground">
            <span
              className={cn(
                "mr-1 flex items-center font-medium",
                isPositive && "text-emerald-500",
                isNegative && "text-destructive"
              )}
            >
              {isPositive ? (
                <ArrowUpIcon className="mr-0.5 h-3 w-3" />
              ) : isNegative ? (
                <ArrowDownIcon className="mr-0.5 h-3 w-3" />
              ) : null}
              {Math.abs(change)}%
            </span>
            {changeLabel}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
