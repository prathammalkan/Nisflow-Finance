"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoanForm } from "@/components/loans/loan-form";
import { formatINR } from "@/lib/finance/money";
import { calculateEMI, generateAmortizationSchedule } from "@/lib/finance/loans";

export default function LoansPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Temporary mock data until React Query hooks are implemented
  const mockLoans = [
    {
      id: "1",
      name: "Dream Home",
      lender_name: "HDFC Bank",
      principal_amount: 5000000,
      interest_rate: 8.5,
      tenure_months: 240,
      start_date: "2023-01-01",
      remaining_principal: 4800000,
      status: "active",
    }
  ];

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mockLoans.map(loan => {
          const emi = calculateEMI(loan.principal_amount, loan.interest_rate, loan.tenure_months);
          const schedule = generateAmortizationSchedule(loan.principal_amount, loan.interest_rate, loan.tenure_months);
          const totalInterest = schedule.reduce((sum, row) => sum + row.interestComponent.toNumber(), 0);
          
          return (
            <Card key={loan.id} className="overflow-hidden">
              <div className="bg-slate-900 h-2 w-full" />
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">{loan.name}</CardTitle>
                <CardDescription>{loan.lender_name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly EMI</p>
                      <p className="text-2xl font-bold">{formatINR(emi.toNumber())}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Remaining</p>
                      <p className="text-lg font-semibold">{formatINR(loan.remaining_principal)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 p-3 rounded-lg">
                    <div>
                      <p className="text-muted-foreground">Interest Rate</p>
                      <p className="font-medium">{loan.interest_rate}% p.a.</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tenure</p>
                      <p className="font-medium">{loan.tenure_months} mos</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Interest</p>
                      <p className="font-medium text-red-500">{formatINR(totalInterest)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Start Date</p>
                      <p className="font-medium">{new Date(loan.start_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full">View Amortization Schedule</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
