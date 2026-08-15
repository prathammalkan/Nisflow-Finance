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

export default function InvestmentsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Temporary mock data until React Query hooks are implemented
  const mockInvestments = [
    {
      id: "1",
      name: "Parag Parikh Flexi Cap",
      ticker_symbol: "PPFAS",
      asset_class: "mutual_fund",
      platform: "Zerodha",
      current_value: 125000,
      invested_amount: 100000,
      cash_flows: [
        { date: new Date("2023-01-01"), amount: -50000 },
        { date: new Date("2023-06-01"), amount: -50000 },
        { date: new Date(), amount: 125000 } // Current value as inflow
      ]
    }
  ];

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
        {mockInvestments.map(inv => {
          const absoluteReturn = inv.current_value - inv.invested_amount;
          const absoluteReturnPct = (absoluteReturn / inv.invested_amount) * 100;
          
          // Calculate XIRR
          const xirrRaw = calculateXIRRDecimal(inv.cash_flows);
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
