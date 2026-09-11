import * as React from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/finance/money";

interface MoneyDisplayProps {
  amount: number | string;
  size?: "sm" | "md" | "lg" | "xl";
  direction?: "in" | "out" | "neutral";
  showSign?: boolean;
  className?: string;
}

export function MoneyDisplay({
  amount,
  size = "md",
  direction = "neutral",
  showSign = false,
  className,
}: MoneyDisplayProps) {
  const sizeClasses = {
    sm: "text-base font-medium",
    md: "text-xl font-semibold",
    lg: "text-3xl font-semibold",
    xl: "text-5xl font-light tracking-tight",
  };

  const colorClasses = {
    in: "text-income",
    out: "text-expense",
    neutral: "text-foreground",
  };

  const sign = showSign
    ? direction === "in"
      ? "+"
      : direction === "out"
      ? "-"
      : ""
    : "";
  const formatted = formatINR(amount);

  return (
    <span
      className={cn(
        "font-tabular-nums",
        sizeClasses[size],
        colorClasses[direction],
        className
      )}
    >
      {sign}
      {formatted}
    </span>
  );
}
