"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InvestmentForm } from "@/components/investments/investment-form";
import { InvestmentTransactionForm } from "@/components/investments/investment-transaction-form";
import { formatINR } from "@/lib/finance/money";
import { calculateXIRRDecimal } from "@/lib/finance/xirr";
import Decimal from "decimal.js";
import { useInvestments } from "@/lib/hooks/use-investments";
import { Loader2 } from "lucide-react";

export default function InvestmentsPage() {
  const [isAddInvestmentOpen, setIsAddInvestmentOpen] = useState(false);
  const [selectedInvestmentForSIP, setSelectedInvestmentForSIP] = useState<{ id: string; name: string } | null>(null);
  
  const { data: investments, isLoading } = useInvestments();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Investments & SIPs" 
        description="Track your Mutual Funds, Stocks, and Portfolio XIRR"
      >
        <Dialog open={isAddInvestmentOpen} onOpenChange={setIsAddInvestmentOpen}>
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
            <InvestmentForm onSuccess={() => setIsAddInvestmentOpen(false)} />
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          const rawInvested = inv.total_invested ?? inv.invested_amount ?? 0;
          const rawCurrent = inv.current_value ?? rawInvested;
          const currentValNum = new Decimal(rawCurrent).toNumber();

          // Aggregate cash flows for XIRR
          const txFlows = inv.investment_transactions?.map((tx: any) => ({
             date: new Date(tx.date),
             amount: tx.type === 'buy' ? -Number(tx.amount) : Number(tx.amount)
          })) || [];
          
          const invested_amount = txFlows.filter((f: any) => f.amount < 0).reduce((sum: number, f: any) => sum + Math.abs(f.amount), 0) || rawInvested;

          const cash_flows = [...txFlows, { date: new Date(), amount: currentValNum }];

          const absoluteReturn = currentValNum - invested_amount;
          const absoluteReturnPct = invested_amount > 0 ? (absoluteReturn / invested_amount) * 100 : 0;
          
          // Calculate XIRR
          const xirrRaw = calculateXIRRDecimal(cash_flows);
          const xirrPct = xirrRaw ? xirrRaw.times(100).toFixed(2) : "N/A";

          const platform = inv.broker || inv.platform || "Direct";
          const assetType = (inv.asset_type || inv.asset_class || "other").replace("_", " ");

          return (
            <Card key={inv.id} className="overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="bg-primary h-1.5 w-full" />
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <Link
                        href={`/investments/${inv.id}`}
                        className="group inline-flex items-center gap-1 hover:underline text-foreground"
                      >
                        <CardTitle className="text-lg font-semibold">{inv.name}</CardTitle>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <CardDescription className="capitalize">
                        {platform} • {assetType} {inv.symbol ? `(${inv.symbol})` : ''}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Current Value</p>
                      <p className="text-2xl font-bold text-foreground">{formatINR(currentValNum)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Invested</p>
                      <p className="text-base font-semibold text-foreground">{formatINR(invested_amount)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-3 rounded-lg border">
                    <div>
                      <p className="text-muted-foreground">Absolute Return</p>
                      <p className={`font-semibold mt-0.5 ${absoluteReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {absoluteReturn >= 0 ? '+' : ''}{formatINR(absoluteReturn)} ({absoluteReturnPct.toFixed(2)}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">XIRR</p>
                      <p className={`font-semibold mt-0.5 ${xirrRaw && xirrRaw.gte(0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {xirrPct !== 'N/A' && Number(xirrPct) >= 0 ? '+' : ''}{xirrPct}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </div>

              <div className="p-6 pt-0">
                <Button 
                  variant="outline" 
                  className="w-full text-xs font-semibold"
                  onClick={() => setSelectedInvestmentForSIP({ id: inv.id, name: inv.name })}
                >
                  Record SIP / Add Funds
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedInvestmentForSIP && (
        <InvestmentTransactionForm
          investmentId={selectedInvestmentForSIP.id}
          investmentName={selectedInvestmentForSIP.name}
          onClose={() => setSelectedInvestmentForSIP(null)}
        />
      )}
    </div>
  );
}
