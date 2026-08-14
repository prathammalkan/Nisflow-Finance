"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Decimal from "decimal.js";

export interface SplitParticipant {
  personId: string;
  personName: string;
  amount: number;
}

export interface CreateBillSplitInput {
  title: string;
  totalAmount: number;
  paidByAccountId: string;
  date: string;
  participants: SplitParticipant[];
  notes?: string;
}

export function useCreateBillSplit() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBillSplitInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const total = new Decimal(input.totalAmount);
      const createdReceivables = [];

      // 1. Create a primary expense transaction for the full bill
      const { data: mainTx, error: txError } = await (supabase.from("transactions") as any)
        .insert([{
          user_id: user.id,
          account_id: input.paidByAccountId,
          transaction_type: "expense",
          direction: "out",
          amount: total.toNumber(),
          date: input.date,
          description: `Bill Split: ${input.title}`,
          ownership: "personal",
          status: "confirmed",
          notes: input.notes,
        }])
        .select()
        .single();

      if (txError) throw txError;

      // 2. Create receivables for each participant who owes money
      for (const p of input.participants) {
        if (p.amount > 0) {
          const { data: rec, error: recError } = await (supabase.from("receivables") as any)
            .insert([{
              user_id: user.id,
              counterparty_id: p.personId,
              original_amount: p.amount,
              remaining_amount: p.amount,
              reason: `Bill Split: ${input.title}`,
              due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days default
              status: "pending",
              notes: `Split from transaction ID: ${mainTx?.id || ''}`,
            }])
            .select()
            .single();

          if (recError) console.warn("Failed to create receivable for split participant:", recError);
          else createdReceivables.push(rec);
        }
      }

      return { mainTx, createdReceivables };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      toast.success("Bill split successfully! Receivables have been created.");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to split bill");
    },
  });
}
