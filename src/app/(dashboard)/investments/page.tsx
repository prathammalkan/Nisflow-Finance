"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InvestmentForm } from "@/components/investments/investment-form";
import { formatINR } from "@/lib/finance/money";
import { calculateXIRRDecimal, CashFlow } from "@/lib/finance/xirr";
import Decimal from "decimal.js";
import { useInvestments } from "@/lib/hooks/use-investments";
import { Loader2 } from "lucide-react";

export default function InvestmentsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: investments, isLoading } = useInvestments();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Investments & SIPs" 
        description="Track your Mutual Funds, Stocks, and Portfolio XIRR"
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Investment
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Investment</DialogTitle>
            </DialogHeader>
            <InvestmentForm onSuccess={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading && (
          <div className="col-span-full flex justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading portfolio...
          </div>
        )}
        {!isLoading && investments?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
            No active investments found. Click "Add Investment" to start tracking.
          </div>
        )}
        {investments?.map((inv: any) => {
          // Aggregate cash flows
          const txFlows = inv.investment_transactions?.map((tx: any) => ({
             date: new Date(tx.date),
             amount: tx.type === 'buy' ? -tx.amount : tx.amount
          })) || [];
          
          const invested_amount = txFlows.filter((f: any) => f.amount < 0).reduce((sum: number, f: any) => sum + Math.abs(f.amount), 0) || inv.current_value;

          const cash_flows = [...txFlows, { date: new Date(), amount: inv.current_value }];

          const absoluteReturn = inv.current_value - invested_amount;
          const absoluteReturnPct = invested_amount > 0 ? (absoluteReturn / invested_amount) * 100 : 0;
          
          // Calculate XIRR
          const xirrRaw = calculateXIRRDecimal(cash_flows);
          const xirrPct = xirrRaw ? xirrRaw.times(100).toFixed(2) : "N/A";

          return (
            <Card key={inv.id} className="overflow-hidden">
              <div className="bg-blue-600 h-2 w-full" />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl">{inv.name}</CardTitle>
                    <CardDescription>{inv.platform} • {inv.asset_class.replace("_", " ")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Value</p>
                      <p className="text-2xl font-bold">{formatINR(inv.current_value)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Invested</p>
                      <p className="text-lg font-semibold">{formatINR(inv.invested_amount)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 p-3 rounded-lg">
                    <div>
                      <p className="text-muted-foreground">Absolute Return</p>
                      <p className={`font-medium ${absoluteReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {absoluteReturn >= 0 ? '+' : ''}{formatINR(absoluteReturn)} ({absoluteReturnPct.toFixed(2)}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">XIRR</p>
                      <p className={`font-medium ${xirrRaw && xirrRaw.gte(0) ? 'text-green-500' : 'text-red-500'}`}>
                        {xirrPct}%
                      </p>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full">Record SIP / Add Funds</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
