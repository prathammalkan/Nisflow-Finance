"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useCreateInvestment } from "@/lib/hooks/use-investments";
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

const investmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ticker: z.string().optional(),
  type: z.enum(["mutual_fund", "stock", "fd", "bond", "real_estate", "crypto", "other"]),
  platform: z.string().optional(),
  units: z.number().positive("Units must be positive").optional(),
  avg_purchase_price: z.number().positive("Price must be positive").optional(),
  current_value: z.number().positive("Current value must be positive"),
});

type InvestmentFormValues = z.infer<typeof investmentSchema>;

export function InvestmentForm({ onSuccess }: { onSuccess?: () => void }) {
  const createInvestment = useCreateInvestment();

  const form = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentSchema),
    defaultValues: {
      name: "",
      ticker: "",
      type: "mutual_fund",
      platform: "Zerodha",
      current_value: 0,
    },
  });

  async function onSubmit(data: InvestmentFormValues) {
    try {
      await createInvestment.mutateAsync({
        name: data.name,
        ticker: data.ticker,
        type: data.type,
        platform: data.platform,
        units: data.units,
        avg_purchase_price: data.avg_purchase_price,
        current_value: data.current_value,
      });

      toast.success("Investment added successfully");
      form.reset();
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add investment");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Investment Name</FormLabel>
                <FormControl>
                  <Input placeholder="Parag Parikh Flexi Cap" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="ticker"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ticker / Symbol</FormLabel>
                <FormControl>
                  <Input placeholder="PPFAS" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Asset Class</FormLabel>
                <FormControl>
                  <Select
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="mutual_fund">Mutual Fund (SIP)</option>
                    <option value="stock">Stock</option>
                    <option value="fd">Fixed Deposit</option>
                    <option value="bond">Bond</option>
                    <option value="real_estate">Real Estate</option>
                    <option value="crypto">Crypto</option>
                    <option value="other">Other</option>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="platform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Platform / Broker</FormLabel>
                <FormControl>
                  <Input placeholder="Zerodha Coin" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="current_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Value</FormLabel>
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
            name="avg_purchase_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Avg Purchase Price (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.01" 
                    {...field} 
                    onChange={e => field.onChange(parseFloat(e.target.value) || undefined)} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={createInvestment.isPending}>
            {createInvestment.isPending ? "Saving..." : "Add Investment"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
