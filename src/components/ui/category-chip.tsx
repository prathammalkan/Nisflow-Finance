import * as React from "react";
import { cn } from "@/lib/utils";

interface CategoryChipProps {
  label: string;
  icon?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CategoryChip({
  label,
  icon,
  selected = false,
  onClick,
  className,
}: CategoryChipProps) {
  return (
    <button
      type="button"
      role="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-primary/10 text-primary border border-primary/30"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-transparent",
        className
      )}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {label}
    </button>
  );
}
