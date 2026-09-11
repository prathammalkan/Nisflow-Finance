import * as React from "react";
import { cn } from "@/lib/utils";
import { MoneyDisplay } from "./money-display";
import { format, parseISO } from "date-fns";

interface TransactionRowProps {
  description: string;
  category?: string;
  categoryIcon?: string;
  accountName?: string;
  date: Date | string;
  amount: number | string;
  direction: "in" | "out" | "neutral";
  status?: string;
  onClick?: () => void;
  className?: string;
}

export function TransactionRow({
  description,
  category,
  categoryIcon,
  accountName,
  date,
  amount,
  direction,
  status,
  onClick,
  className,
}: TransactionRowProps) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  const timeStr = format(dateObj, "h:mm a");

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={cn(
        "flex items-center gap-3 px-4 py-3 min-h-[56px] border-b border-border/60 last:border-0",
        "transition-colors",
        onClick && "cursor-pointer hover:bg-muted/40",
        className
      )}
    >
      {/* Category indicator */}
      <div
        className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center bg-muted text-base select-none"
        aria-hidden="true"
      >
        {categoryIcon || (category ? category.charAt(0) : "·")}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{description}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {category || accountName || ""}
          {accountName && category && " · "}
          {accountName && !category ? "" : ""}
          <span className="ml-1 opacity-70">{timeStr}</span>
        </p>
      </div>

      {/* Amount + status */}
      <div className="flex flex-col items-end shrink-0">
        <MoneyDisplay amount={amount} size="md" direction={direction} showSign />
        {status === "needs_review" && (
          <span className="mt-0.5 text-[10px] font-medium text-caution bg-caution rounded-full px-1.5 py-0.5">
            Review
          </span>
        )}
      </div>
    </div>
  );
}
