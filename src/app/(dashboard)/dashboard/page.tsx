"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  useDashboardStats,
  useRecentTransactions,
} from "@/lib/hooks/use-dashboard";
import { formatINR } from "@/lib/finance/money";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { cn } from "@/lib/utils";
import { useSaveNetWorthSnapshot } from "@/lib/hooks/use-net-worth-history";
import { useProfile } from "@/lib/hooks/use-profile";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { Plus, ArrowRightLeft, Sparkles, ChevronRight } from "lucide-react";
import { TransactionForm } from "@/components/transactions/transaction-form";

function groupTransactionsByDate(transactions: any[]) {
  const groups: Record<string, any[]> = {};
  for (const tx of transactions) {
    const dateKey = tx.date ? tx.date.split("T")[0] : "unknown";
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(tx);
  }
  return groups;
}

function friendlyDate(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMMM d");
  } catch {
    return dateStr;
  }
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recent, isLoading: recentLoading } = useRecentTransactions(8);
  const { data: profile } = useProfile();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormType, setTxFormType] = useState<"Expense" | "Income" | "Transfer">("Expense");
  const saveSnapshot = useSaveNetWorthSnapshot();
  const hasSaved = useRef(false);

  useEffect(() => {
    if (!statsLoading && stats && !hasSaved.current) {
      const today = new Date().toISOString().split("T")[0];
      const lastSaved = localStorage.getItem("nisflow_snapshot_date");
      if (lastSaved === today) return;
      hasSaved.current = true;
      saveSnapshot.mutate(
        {
          personalCash: stats.availablePersonalCash || 0,
          savings: stats.totalSavings || 0,
          investments: stats.totalInvestments || 0,
          receivables: stats.totalReceivables || 0,
          payables: stats.totalPayables || 0,
          thirdPartyHeld: stats.thirdPartyHeld || 0,
          netWorth: stats.personalNetWorth || 0,
        },
        {
          onSuccess: () =>
            localStorage.setItem("nisflow_snapshot_date", today),
          onError: (err) =>
            console.warn("Failed to auto-save net worth snapshot", err),
        }
      );
    }
  }, [stats, statsLoading, saveSnapshot]);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        if (
          typeof window !== "undefined" &&
          localStorage.getItem("nisflow_onboarding_completed") === "true"
        ) {
          setOnboardingDismissed(true);
          return;
        }
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.user_metadata?.onboarding_completed === true) {
          try {
            localStorage.setItem("nisflow_onboarding_completed", "true");
          } catch (_) {}
          setOnboardingDismissed(true);
        }
      } catch (_) {}
    };
    checkOnboarding();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const needsOnboarding = !statsLoading && !onboardingDismissed;

  const available = stats?.availablePersonalCash || 0;
  const income = stats?.thisMonthIncome || 0;
  const expenses = stats?.thisMonthExpenses || 0;
  const spentPercent = income > 0 ? Math.min(100, (expenses / income) * 100) : 0;

  const grouped = groupTransactionsByDate(recent || []);
  const sortedDateKeys = Object.keys(grouped).sort((a, b) =>
    b.localeCompare(a)
  );

  const openTxForm = (type: "Expense" | "Income" | "Transfer") => {
    setTxFormType(type);
    setTxFormOpen(true);
  };

  return (
    <>
      {needsOnboarding && (
        <OnboardingWizard onComplete={() => setOnboardingDismissed(true)} />
      )}

      <div
        className={cn(
          "flex-1 max-w-2xl mx-auto w-full space-y-8 pb-6",
          needsOnboarding && "blur-sm pointer-events-none select-none"
        )}
      >
        {/* Greeting */}
        <div className="pt-2">
          <p className="text-sm text-muted-foreground">
            {greeting()}
            {profile?.displayName
              ? `, ${profile.displayName.split(" ")[0]}`
              : ""}
          </p>

          {/* Hero number */}
          {statsLoading ? (
            <Skeleton className="mt-2 h-14 w-48" />
          ) : (
            <div className="mt-1">
              <div className="text-5xl font-light tracking-tight font-tabular-nums text-foreground">
                {formatINR(available)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                available this month
              </p>
            </div>
          )}

          {/* Progress bar */}
          {!statsLoading && income > 0 && (
            <div className="mt-5">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${spentPercent}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span className="text-income font-medium">{formatINR(income)}</span>
                  <span className="ml-1">income</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-expense font-medium">{formatINR(expenses)}</span>
                  <span className="ml-1">spent</span>
                </div>
              </div>
            </div>
          )}

          {/* No accounts state */}
          {!statsLoading && (stats?.totalAccounts || 0) === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                Your money starts here.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first account to see your financial picture.
              </p>
              <Link
                href="/accounts"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Add account
              </Link>
            </div>
          )}
        </div>

        {/* AI insight — quiet contextual line */}
        {!statsLoading && (stats?.totalAccounts || 0) > 0 && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-primary/60" />
            <span>
              {(stats?.needsReviewCount || 0) > 0
                ? `${stats!.needsReviewCount} transaction${stats!.needsReviewCount === 1 ? "" : "s"} need${stats!.needsReviewCount === 1 ? "s" : ""} your review.`
                : expenses > 0
                ? `You have spent ${Math.round(spentPercent)}% of your income this month.`
                : "No expenses recorded yet this month."}
              {" "}
              <Link href="/insights" className="text-primary hover:underline">
                Ask NisFlow →
              </Link>
            </span>
          </div>
        )}

        {/* Recent transactions journal */}
        {(stats?.totalAccounts || 0) > 0 && (
          <div>
            {recentLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : (recent || []).length > 0 ? (
              <div className="space-y-6">
                {sortedDateKeys.slice(0, 3).map((dateKey) => (
                  <div key={dateKey}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {friendlyDate(dateKey)}
                    </h3>
                    <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/60">
                      {grouped[dateKey].map((tx: any) => (
                        <Link
                          key={tx.id}
                          href={`/transactions/${tx.id}`}
                          className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-muted/40 transition-colors"
                        >
                          <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center bg-muted text-sm select-none">
                            {tx.category?.icon || (tx.category?.name ? tx.category.name.charAt(0) : "·")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {tx.description || "Transaction"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {tx.category?.name || tx.account?.name || ""}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "text-sm font-semibold font-tabular-nums shrink-0",
                              tx.direction === "in"
                                ? "text-income"
                                : tx.direction === "out"
                                ? "text-expense"
                                : "text-foreground"
                            )}
                          >
                            {tx.direction === "in" ? "+" : tx.direction === "out" ? "-" : ""}
                            {formatINR(tx.amount)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
                <Link
                  href="/transactions"
                  className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  View all activity
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the quick actions below to record your first transaction.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Quick actions */}
        {(stats?.totalAccounts || 0) > 0 && (
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quick actions
            </h3>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => openTxForm("Expense")}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
              >
                <Plus className="h-4 w-4 text-expense" aria-hidden="true" />
                Expense
              </button>
              <button
                onClick={() => openTxForm("Income")}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
              >
                <Plus className="h-4 w-4 text-income" aria-hidden="true" />
                Income
              </button>
              <button
                onClick={() => openTxForm("Transfer")}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
              >
                <ArrowRightLeft className="h-4 w-4 text-balance" aria-hidden="true" />
                Transfer
              </button>
            </div>
          </div>
        )}

        {/* Financial snapshot — progressive disclosure */}
        {!statsLoading && (stats?.totalAccounts || 0) > 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Financial snapshot
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Net worth</p>
                <p className="font-semibold font-tabular-nums">
                  {formatINR(stats?.personalNetWorth || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Savings</p>
                <p className="font-semibold font-tabular-nums text-income">
                  {formatINR(stats?.totalSavings || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Investments</p>
                <p className="font-semibold font-tabular-nums text-balance">
                  {formatINR(stats?.totalInvestments || 0)}
                </p>
              </div>
              {(stats?.needsReviewCount || 0) > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Needs review</p>
                  <Link
                    href="/transactions?status=needs_review"
                    className="font-semibold font-tabular-nums text-caution hover:underline"
                  >
                    {stats?.needsReviewCount} item{stats?.needsReviewCount === 1 ? "" : "s"}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <TransactionForm
        open={txFormOpen}
        onOpenChange={setTxFormOpen}
        defaultType={txFormType}
      />
    </>
  );
}
