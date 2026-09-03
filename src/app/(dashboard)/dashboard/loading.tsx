import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="space-y-1.5">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-52" />
      </div>

      {/* 8 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>

      {/* AI Insight card */}
      <Skeleton className="h-28 w-full rounded-xl" />

      {/* Income vs Expenses + Spending by Category charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
      </div>

      {/* Net Worth chart */}
      <Skeleton className="h-[320px] rounded-xl" />

      {/* Receivables + Payables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Recent Transactions */}
      <Skeleton className="h-56 rounded-xl" />

      {/* Reconciliation status */}
      <Skeleton className="h-14 rounded-lg" />
    </div>
  );
}
