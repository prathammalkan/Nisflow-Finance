import * as React from "react";
import { cn } from "@/lib/utils";

interface InsightCardProps {
  insight: string;
  metric?: string;
  type?: "positive" | "negative" | "neutral" | "warning";
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function InsightCard({
  insight,
  metric,
  type = "neutral",
  actionLabel,
  onAction,
  className,
}: InsightCardProps) {
  const borderColors = {
    positive: "border-l-[3px] border-l-[hsl(152,55%,36%)]",
    negative: "border-l-[3px] border-l-[hsl(12,60%,40%)]",
    warning: "border-l-[3px] border-l-[hsl(38,65%,36%)]",
    neutral: "border-l-[3px] border-l-border",
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4",
        borderColors[type],
        className
      )}
    >
      <p className="text-sm text-foreground leading-relaxed">{insight}</p>
      {metric && (
        <p className="mt-1 text-xs font-medium text-muted-foreground font-tabular-nums">
          {metric}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}
