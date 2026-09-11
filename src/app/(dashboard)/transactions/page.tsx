"use client";

import { useState } from "react";
import Link from "next/link";
import { useTransactions } from "@/lib/hooks/use-transactions";
import { formatINR } from "@/lib/finance/money";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { Plus, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { cn } from "@/lib/utils";
import Decimal from "decimal.js";

function groupByDate(transactions: any[]) {
  const groups: Record<string, any[]> = {};
  for (const tx of transactions) {
    const key = tx.date ? tx.date.split("T")[0] : "unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }
  return groups;
}

function friendlyDate(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMMM d");
  } catch {
    return dateStr;
  }
}

export default function TransactionsPage() {
  const [filters, setFilters] = useState<any>({
    page: 1,
    pageSize: 30,
    sortBy: "date",
    sortOrder: "desc",
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useTransactions(filters);

  const handleFilterChange = (newFilters: any) => {
    setFilters({ ...filters, ...newFilters, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev: any) => ({ ...prev, page: newPage }));
  };

  const transactions = data?.data || [];
  const grouped = groupByDate(transactions);
  const sortedDateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const totalPages = Math.ceil((data?.total || 0) / (filters.pageSize || 30));

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full space-y-0 pb-24 md:pb-6">
      {/* Page header */}
      <div className="sticky top-12 z-20 bg-background/95 backdrop-blur-sm border-b border-border/60 px-0 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Activity</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-8 px-3 gap-1.5 text-sm",
              showFilters && "bg-primary/10 text-primary"
            )}
          >
            <Filter className="h-4 w-4" />
            Filter
          </Button>
          <Button
            size="sm"
            onClick={() => setIsFormOpen(true)}
            className="h-8 px-3 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>

      {/* Filters — collapsed by default */}
      {showFilters && (
        <div className="py-3 border-b border-border/60">
          <TransactionFilters filters={filters} onChange={handleFilterChange} />
        </div>
      )}

      {/* Transaction journal */}
      <div className="py-4">
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2].map((g) => (
              <div key={g} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/60">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-none" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : transactions.length > 0 ? (
          <div className="space-y-6">
            {sortedDateKeys.map((dateKey) => (
              <div key={dateKey}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {friendlyDate(dateKey)}
                  </h3>
                  <span className="text-xs text-muted-foreground font-tabular-nums">
                    {formatINR(
                      grouped[dateKey]
                        .filter((tx) => tx.direction === "out")
                        .reduce(
                          (sum, tx) => sum + Number(tx.amount || 0),
                          0
                        )
                    )}
                  </span>
                </div>
                <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/60">
                  {grouped[dateKey].map((tx: any) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-muted/40 transition-colors group"
                    >
                      {/* Category icon */}
                      <Link
                        href={`/transactions/${tx.id}`}
                        className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center bg-muted text-sm select-none"
                        aria-hidden="true"
                        tabIndex={-1}
                      >
                        {tx.category?.icon ||
                          (tx.category?.name
                            ? tx.category.name.charAt(0)
                            : "·")}
                      </Link>

                      {/* Main content */}
                      <Link
                        href={`/transactions/${tx.id}`}
                        className="flex-1 min-w-0"
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {tx.description || "Transaction"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[tx.category?.name, tx.account?.name]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </Link>

                      {/* Amount */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={cn(
                            "text-sm font-semibold font-tabular-nums",
                            tx.direction === "in"
                              ? "text-income"
                              : tx.direction === "out"
                              ? "text-expense"
                              : "text-foreground"
                          )}
                        >
                          {tx.direction === "in"
                            ? "+"
                            : tx.direction === "out"
                            ? "-"
                            : ""}
                          {formatINR(new Decimal(tx.amount || 0))}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <TransactionRowActions transaction={tx} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between py-2">
                <p className="text-xs text-muted-foreground">
                  {data?.data?.length || 0} of {data?.total} transactions
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(filters.page - 1)}
                    disabled={filters.page === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {filters.page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(filters.page + 1)}
                    disabled={filters.page >= totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm font-medium text-foreground">No transactions found</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {showFilters
                ? "Try adjusting your filters."
                : "Add your first transaction to start tracking your money."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFormOpen(true)}
              className="mt-2 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add transaction
            </Button>
          </div>
        )}
      </div>

      {/* FAB on mobile */}
      <button
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-20 right-4 z-30 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Add transaction"
      >
        <Plus className="h-6 w-6" />
      </button>

      <TransactionForm open={isFormOpen} onOpenChange={setIsFormOpen} />
    </div>
  );
}
