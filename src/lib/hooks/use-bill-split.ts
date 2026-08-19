"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { recordLending } from "@/lib/ledger/people";
import { recordFinancialTransaction } from "@/lib/ledger/service";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

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

      const totalBill = new Decimal(input.totalAmount);
      let participantSum = new Decimal(0);

      for (const p of input.participants) {
        if (p.amount > 0) {
          participantSum = participantSum.plus(new Decimal(p.amount));
        }
      }

      const userShare = totalBill.minus(participantSum);
      const createdEntries = [];
      const splitGroupId = `split-${Date.now()}`;

      // 1. Authoritatively record the user's personal expense share if > 0
      if (userShare.gt(0)) {
        const expenseRes = await recordFinancialTransaction(supabase as any, {
          userId: user.id,
          type: "expense",
          accountId: input.paidByAccountId,
          amount: userShare.toFixed(2),
          date: input.date,
          description: `Bill Split (My Share): ${input.title}`,
          notes: input.notes,
          idempotencyKey: `SPLIT:EXP:${splitGroupId}:${user.id}`,
        });

        if (!expenseRes.success) {
          throw new Error(`Failed to record user share of bill: ${expenseRes.error}`);
        }
        createdEntries.push(expenseRes.journalEntryId);
      }

      // 2. Authoritatively record lending (receivable) to each participant via People Ledger
      for (const p of input.participants) {
        if (p.amount > 0) {
          const lendRes = await recordLending(supabase as any, {
            userId: user.id,
            accountId: input.paidByAccountId,
            counterpartyId: p.personId,
            amount: new Decimal(p.amount).toFixed(2),
            date: input.date,
            description: `Bill Split (${p.personName}): ${input.title}`,
            notes: input.notes ? `${input.notes} [Split: ${input.title}]` : `Split: ${input.title}`,
            receivableId: `rec-${splitGroupId}-${p.personId}`,
          });

          if (!lendRes.success) {
            throw new Error(`Failed to record receivable for ${p.personName}: ${lendRes.error}`);
          }
          createdEntries.push(lendRes.journalEntryId);
        }
      }

      return { success: true, entryCount: createdEntries.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["receivables-summary"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["people_ledger_summary"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Bill split recorded successfully in double-entry ledger!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to split bill");
    },
  });
}
