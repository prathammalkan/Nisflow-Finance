"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatINR } from "@/lib/finance/money";
import { calculateEMI, calculateSimpleInterest } from "@/lib/hooks/use-loan-calculator";
import { Calculator, Percent, Calendar, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface LoanCalculatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoanCalculatorDialog({ open, onOpenChange }: LoanCalculatorDialogProps) {
  const [principal, setPrincipal] = useState(500000);
  const [rate, setRate] = useState(10.5);
  const [tenureYears, setTenureYears] = useState(3);
  const [calcType, setCalcType] = useState<"emi" | "simple">("emi");

  const tenureMonths = tenureYears * 12;
  const result = calcType === "emi"
    ? calculateEMI(principal, rate, tenureMonths)
    : calculateSimpleInterest(principal, rate, tenureMonths);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Calculator className="h-5 w-5" />
            </div>
            <DialogTitle>Loan Interest & EMI Calculator</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex rounded-lg border bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setCalcType("emi")}
              className={`flex-1 py-1.5 font-medium rounded-md transition-all ${calcType === "emi" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
            >
              Reducing Balance (EMI)
            </button>
            <button
              type="button"
              onClick={() => setCalcType("simple")}
              className={`flex-1 py-1.5 font-medium rounded-md transition-all ${calcType === "simple" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
            >
              Simple Interest
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Loan Amount (Principal)</Label>
              <CurrencyInput value={principal} onChange={(v) => setPrincipal(v || 0)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Interest Rate (% p.a.)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Tenure (Years)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="30"
                    value={tenureYears}
                    onChange={(e) => setTenureYears(Number(e.target.value))}
                    className="pr-8"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary Box */}
          <div className="rounded-xl border bg-muted/40 p-4 space-y-3">
            <div className="text-center pb-2 border-b">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Monthly Installment (EMI)</p>
              <p className="text-3xl font-bold text-primary tracking-tight mt-1">
                {formatINR(result.monthlyEMI)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="flex flex-col p-2 rounded bg-card border">
                <span className="text-muted-foreground">Total Interest:</span>
                <span className="font-semibold text-destructive mt-0.5">{formatINR(result.totalInterest)}</span>
              </div>

              <div className="flex flex-col p-2 rounded bg-card border">
                <span className="text-muted-foreground">Total Amount Payable:</span>
                <span className="font-semibold text-foreground mt-0.5">{formatINR(result.totalAmount)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
