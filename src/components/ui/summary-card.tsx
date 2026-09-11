import * as React from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/finance/money";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";

interface SummaryCardProps {
  title: string;
  amount: number | string;
  semantic?: "income" | "expense" | "balance" | "caution" | "neutral";
  trend?: number;
  className?: string;
}

export function SummaryCard({
  title,
  amount,
  semantic = "neutral",
  trend,
  className,
}: SummaryCardProps) {
  const bgClasses = {
    income: "bg-income",
    expense: "bg-expense",
    balance: "bg-balance",
    caution: "bg-caution",
    neutral: "bg-muted/50",
  };

  const textClasses = {
    income: "text-income",
    expense: "text-expense",
    balance: "text-balance",
    caution: "text-caution",
    neutral: "text-foreground",
  };

  const isPositiveTrend = trend !== undefined && trend > 0;
  const isNegativeTrend = trend !== undefined && trend < 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 p-4 shadow-sm",
        bgClasses[semantic],
        className
      )}
    >
      <p className="text-xs font-medium text-muted-foreground mb-2 truncate">
        {title}
      </p>
      <p
        className={cn(
          "text-2xl font-semibold font-tabular-nums tracking-tight",
          textClasses[semantic]
        )}
      >
        {formatINR(amount)}
      </p>
      {trend !== undefined && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          {isPositiveTrend ? (
            <ArrowUpIcon className="h-3 w-3 text-income" />
          ) : isNegativeTrend ? (
            <ArrowDownIcon className="h-3 w-3 text-expense" />
          ) : null}
          <span
            className={cn(
              isPositiveTrend && "text-income",
              isNegativeTrend && "text-expense"
            )}
          >
            {Math.abs(trend)}%
          </span>
          <span>vs last month</span>
        </p>
      )}
    </div>
  );
}
