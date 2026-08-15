"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, FileText, PieChart, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { generateTransactionPDF, TransactionReportData } from "@/lib/reports/pdf-generator";
import { generateTaxPDF, TaxReportData } from "@/lib/reports/tax-generator";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ReportsPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingTax, setIsGeneratingTax] = useState(false);
  const supabase = createClient();

  const handleDownloadStatement = async () => {
    setIsGenerating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const profileRes = await supabase.from('profiles').select('full_name').eq('id', userData.user.id).single();
      const userName = (profileRes.data as any)?.full_name || userData.user.email || "NisFlow User";

      // Fetch current month transactions
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('transactions')
        .select('date, description, amount, direction, categories!transactions_category_id_fkey(name)')
        .eq('user_id', userData.user.id)
        .gte('date', startOfMonth.toISOString())
        .order('date', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error("No transactions found for the current month.");
        setIsGenerating(false);
        return;
      }

      const formattedData: TransactionReportData[] = data.map((tx: any) => ({
        date: tx.date,
        description: tx.description,
        amount: Number(tx.amount),
        direction: tx.direction,
        category: tx.categories?.name || 'Uncategorized'
      }));

      const monthName = format(new Date(), 'MMMM');
      const yearName = format(new Date(), 'yyyy');

      generateTransactionPDF(formattedData, monthName, yearName, userName);
      toast.success("Statement generated successfully!");

    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadTax = async () => {
    setIsGeneratingTax(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const profileRes = await supabase.from('profiles').select('full_name').eq('id', userData.user.id).single();
      const userName = (profileRes.data as any)?.full_name || userData.user.email || "NisFlow User";

      // Fetch YTD transactions
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, direction, categories!transactions_category_id_fkey(name)')
        .eq('user_id', userData.user.id)
        .gte('date', startOfYear.toISOString());

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error("No transactions found for the current year.");
        setIsGeneratingTax(false);
        return;
      }

      // Aggregate by category
      const categoryMap = new Map<string, { in: number, out: number }>();
      data.forEach((tx: any) => {
        const cat = tx.categories?.name || 'Uncategorized';
        const amt = Number(tx.amount);
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { in: 0, out: 0 });
        }
        const record = categoryMap.get(cat)!;
        if (tx.direction === 'in') record.in += amt;
        else record.out += amt;
      });

      const taxData: TaxReportData[] = Array.from(categoryMap.entries()).map(([cat, flows]) => ({
        category: cat,
        totalIncome: flows.in,
        totalExpense: flows.out,
        netImpact: flows.in - flows.out
      }));

      const yearName = format(new Date(), 'yyyy');

      generateTaxPDF(taxData, yearName, userName);
      toast.success("Tax Summary generated successfully!");

    } catch (error: any) {
      toast.error(error.message || "Failed to generate tax report");
    } finally {
      setIsGeneratingTax(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Reports & Analytics" 
        description="Generate statements, tax summaries, and deep insights"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Monthly Statement</CardTitle>
                <CardDescription>Download a PDF of all your transactions for the current month.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={handleDownloadStatement}
              disabled={isGenerating}
            >
              <Download className="w-4 h-4 mr-2" />
              {isGenerating ? "Generating..." : "Download PDF Statement"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <PieChart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle>Tax & PnL Summary</CardTitle>
                <CardDescription>Generate a comprehensive tax report for the financial year.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              variant="outline" 
              onClick={handleDownloadTax}
              disabled={isGeneratingTax}
            >
              <Download className="w-4 h-4 mr-2" />
              {isGeneratingTax ? "Generating..." : "Download PDF Summary"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
