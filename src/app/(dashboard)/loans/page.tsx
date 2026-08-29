"use client";

import { useState } from "react";
import { Plus, CreditCard, CheckCircle2, History, Loader2, Calendar, Landmark } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LoanForm } from "@/components/loans/loan-form";
import { EmiPaymentDialog } from "@/components/loans/emi-payment-dialog";
import { AmortizationScheduleDialog } from "@/components/loans/amortization-schedule-dialog";
import { formatINR } from "@/lib/finance/money";
import { calculateEMI, generateAmortizationSchedule } from "@/lib/finance/loans";
import { useLoans, useLoansSummary } from "@/lib/hooks/use-loans";

export default function LoansPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedLoanForEMI, setSelectedLoanForEMI] = useState<any | null>(null);
  const [selectedLoanForSchedule, setSelectedLoanForSchedule] = useState<any | null>(null);

  const { data: loans, isLoading } = useLoans();
  const { data: summary } = useLoansSummary();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Loans & EMIs" 
        description="Authoritative debt tracking, EMI payments, and amortization powered by double-entry ledger"
      >
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Loan</DialogTitle>
            </DialogHeader>
            <LoanForm onSuccess={() => setIsAddDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl">
          <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase tracking-wider">
            Total Outstanding Principal
          </div>
          <div className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">
            {formatINR(summary?.totalOutstandingPrincipal ?? 0)}
          </div>
        </div>

        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">
            Total Interest Paid
          </div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
            {formatINR(summary?.totalInterestPaid ?? 0)}
          </div>
        </div>

        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
            Active / Settled Loans
          </div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
            {summary?.activeLoansCount ?? 0} Active • {summary?.settledLoansCount ?? 0} Settled
          </div>
        </div>
      </div>

      {/* Loans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border bg-card shadow overflow-hidden">
                <div className="h-1.5 w-full bg-muted" />
                <div className="p-6 space-y-4">
                  <div className="flex justify-between">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-48" />
                  <div className="flex justify-between">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            ))}
          </>
        )}
        {!isLoading && loans?.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={Landmark}
              title="No loans tracked yet"
              description="Add your home loan, car loan, or personal loan to track EMIs, outstanding principal, and interest paid."
              actionLabel="Add Your First Loan"
              onAction={() => setIsAddDialogOpen(true)}
            />
          </div>
        )}
        {loans?.map((loan: any) => {
          const initialPrincipal = Number(loan.principal_amount || loan.principalAmount || 0);
          const remainingPrincipal = loan.authoritativeRemainingPrincipal !== undefined
            ? Number(loan.authoritativeRemainingPrincipal)
            : Number(loan.remaining_principal ?? initialPrincipal);
          
          const interestRate = Number(loan.interest_rate || loan.interestRate || 0);
          const tenureMonths = Number(loan.tenure_months || loan.tenureMonths || 0);
          const isSettled = loan.isSettled || remainingPrincipal <= 0;

          const emi = calculateEMI(initialPrincipal, interestRate, tenureMonths);
          const schedule = generateAmortizationSchedule(initialPrincipal, interestRate, tenureMonths);
          const totalProjectedInterest = schedule.reduce((sum, row) => sum + row.interestComponent.toNumber(), 0);
          
          return (
            <Card key={loan.id} className="overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className={`h-1.5 w-full ${isSettled ? 'bg-emerald-500' : 'bg-slate-900 dark:bg-slate-100'}`} />
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl font-semibold">{loan.name}</CardTitle>
                    <Badge variant={isSettled ? 'default' : 'secondary'} className={isSettled ? 'bg-emerald-600 text-white' : ''}>
                      {isSettled ? 'SETTLED' : 'ACTIVE'}
                    </Badge>
                  </div>
                  <CardDescription className="capitalize">
                    {loan.lender_name || loan.lenderName || "Direct"} • {(loan.loan_type || loan.loanType || "Loan").toUpperCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Monthly EMI</p>
                      <p className="text-2xl font-bold text-foreground">{formatINR(emi.toNumber())}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Remaining (Ledger)</p>
                      <p className={`text-base font-semibold ${isSettled ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                        {formatINR(remainingPrincipal)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-lg border">
                    <div>
                      <p className="text-muted-foreground">Interest Rate</p>
                      <p className="font-semibold text-foreground mt-0.5">{interestRate}% p.a.</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenure</p>
                      <p className="font-semibold text-foreground mt-0.5">{tenureMonths} mos</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Interest Paid</p>
                      <p className="font-semibold text-amber-600 dark:text-amber-400 mt-0.5">{formatINR(loan.totalInterestPaid || 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Start Date</p>
                      <p className="font-semibold text-foreground mt-0.5">{loan.start_date || loan.startDate ? new Date(loan.start_date || loan.startDate).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="p-6 pt-0 space-y-2">
                {!isSettled && (
                  <Button 
                    className="w-full text-xs font-semibold gap-2"
                    onClick={() => setSelectedLoanForEMI(loan)}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Record EMI Payment
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="w-full text-xs font-semibold"
                  onClick={() => setSelectedLoanForSchedule(loan)}
                >
                  View Amortization Schedule
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* EMI Payment Modal */}
      <EmiPaymentDialog
        loan={selectedLoanForEMI}
        open={!!selectedLoanForEMI}
        onOpenChange={(open) => !open && setSelectedLoanForEMI(null)}
      />

      {/* Amortization Schedule Modal */}
      <AmortizationScheduleDialog
        loan={selectedLoanForSchedule}
        onClose={() => setSelectedLoanForSchedule(null)}
      />
    </div>
  );
}
