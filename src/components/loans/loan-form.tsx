"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useCreateLoan } from "@/lib/hooks/use-loans";
import { formatINR } from "@/lib/finance/money";
import { Loader2 } from "lucide-react";

const loanSchema = z.object({
  name: z.string().min(1, "Loan name is required"),
  type: z.enum(["home", "auto", "personal", "education", "business", "other"]),
  lender: z.string().min(1, "Lender name is required"),
  principal_amount: z.number().positive("Amount must be positive"),
  interest_rate: z.number().positive("Interest rate must be positive"),
  tenure_months: z.number().int().positive("Tenure must be positive"),
  start_date: z.string().min(1, "Start date is required"),
  deposit_account_id: z.string().optional(),
});

type LoanFormValues = z.infer<typeof loanSchema>;

export function LoanForm({ onSuccess }: { onSuccess?: () => void }) {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { mutateAsync: createLoan, isPending: isSubmitting } = useCreateLoan();

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      name: "",
      type: "personal",
      lender: "",
      principal_amount: 0,
      interest_rate: 10.5,
      tenure_months: 60,
      start_date: new Date().toISOString().split("T")[0],
      deposit_account_id: "",
    },
  });

  async function onSubmit(data: LoanFormValues) {
    try {
      await createLoan({
        name: data.name,
        type: data.type,
        lender: data.lender,
        principal_amount: data.principal_amount,
        interest_rate: data.interest_rate,
        tenure_months: data.tenure_months,
        start_date: data.start_date,
        deposit_account_id: data.deposit_account_id || (accounts && accounts.length > 0 ? accounts[0].id : undefined),
      });

      form.reset();
      onSuccess?.();
    } catch {
      // Handled in hook toast
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Loan Name (e.g., Dream Home)</FormLabel>
              <FormControl>
                <Input placeholder="Home Loan" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Loan Type</FormLabel>
                <FormControl>
                  <Select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="home">Home Loan</option>
                    <option value="auto">Auto Loan</option>
                    <option value="personal">Personal Loan</option>
                    <option value="education">Education Loan</option>
                    <option value="business">Business Loan</option>
                    <option value="other">Other</option>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="lender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bank / Lender Name</FormLabel>
                <FormControl>
                  <Input placeholder="HDFC Bank" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="principal_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Principal Amount (₹)</FormLabel>
                <FormControl>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="interest_rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Interest Rate (% p.a.)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.01" 
                    {...field} 
                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tenure_months"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tenure (Months)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    {...field} 
                    onChange={e => field.onChange(parseInt(e.target.value) || 1)} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Disbursement / Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="deposit_account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Disbursement Deposit Account</FormLabel>
                <FormControl>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={accountsLoading}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    <option value="">Default Active Account</option>
                    {accounts?.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatINR(acc.balance || 0)})
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Provisioning Ledger...
              </>
            ) : (
              "Add Loan & Disburse"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
