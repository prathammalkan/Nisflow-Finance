"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoanForm } from "@/components/loans/loan-form";
import { AmortizationScheduleDialog } from "@/components/loans/amortization-schedule-dialog";
import { formatINR } from "@/lib/finance/money";
import { calculateEMI, generateAmortizationSchedule } from "@/lib/finance/loans";
import { useLoans } from "@/lib/hooks/use-loans";
import { Loader2 } from "lucide-react";

export default function LoansPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLoanForSchedule, setSelectedLoanForSchedule] = useState<any | null>(null);
  const { data: loans, isLoading } = useLoans();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Loans & EMIs" 
        description="Track your debt, EMI schedules, and amortization"
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Loan</DialogTitle>
            </DialogHeader>
            <LoanForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && (
          <div className="col-span-full flex justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading loans...
          </div>
        )}
        {!isLoading && loans?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
            No active loans found. Click "Add Loan" to start tracking your debt.
          </div>
        )}
        {loans?.map((loan: any) => {
          const emi = calculateEMI(loan.principal_amount, loan.interest_rate, loan.tenure_months);
          const schedule = generateAmortizationSchedule(loan.principal_amount, loan.interest_rate, loan.tenure_months);
          const totalInterest = schedule.reduce((sum, row) => sum + row.interestComponent.toNumber(), 0);
          
          return (
            <Card key={loan.id} className="overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="bg-slate-900 dark:bg-slate-100 h-1.5 w-full" />
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl font-semibold">{loan.name}</CardTitle>
                  <CardDescription className="capitalize">
                    {loan.lender_name || "Direct"} • {(loan.loan_type || "Loan").toUpperCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Monthly EMI</p>
                      <p className="text-2xl font-bold text-foreground">{formatINR(emi.toNumber())}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Remaining</p>
                      <p className="text-base font-semibold text-foreground">{formatINR(loan.remaining_principal ?? loan.principal_amount)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-lg border">
                    <div>
                      <p className="text-muted-foreground">Interest Rate</p>
                      <p className="font-semibold text-foreground mt-0.5">{loan.interest_rate}% p.a.</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenure</p>
                      <p className="font-semibold text-foreground mt-0.5">{loan.tenure_months} mos</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Interest</p>
                      <p className="font-semibold text-rose-600 dark:text-rose-400 mt-0.5">{formatINR(totalInterest)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Start Date</p>
                      <p className="font-semibold text-foreground mt-0.5">{loan.start_date ? new Date(loan.start_date).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="p-6 pt-0">
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

      <AmortizationScheduleDialog
        loan={selectedLoanForSchedule}
        onClose={() => setSelectedLoanForSchedule(null)}
      />
    </div>
  );
}
