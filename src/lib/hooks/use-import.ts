import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { recordFinancialTransaction } from '@/lib/ledger/service';

export function useImportStatement() {
  const supabase = createClient();
  
  return useMutation({
    mutationFn: async (fileData: any) => {
      // Mock logic for uploading file, parsing should be handled in the component
      return fileData;
    }
  });
}

export function useConfirmImport() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ statement, transactions }: { statement: any; transactions: any[] }) => {
      // 1. Create statement
      const { data: stmtData, error: stmtError } = await supabase
        .from('bank_statements')
        .insert([statement] as any)
        .select()
        .single();
        
      if (stmtError) throw stmtError;

      // 2. Insert transactions
      const txsToInsert = transactions.map(t => ({ ...t, statement_id: (stmtData as any).id }));
      const { error: txError } = await supabase
        .from('bank_statement_transactions')
        .insert(txsToInsert as any);
        
      if (txError) throw txError;
      
      return stmtData as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import_history'] });
    },
  });
}

export function useImportHistory() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['import_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_statements')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      return data as any[];
    }
  });
}

export function usePostStatementToLedger() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountId,
      statementId,
      transactions,
    }: {
      accountId: string;
      statementId: string;
      transactions: Array<{
        date: string;
        description: string;
        amount: number | string;
        direction: 'in' | 'out';
        reference?: string;
        categoryId?: string;
        rowIndex: number;
      }>;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const results = [];
      for (const tx of transactions) {
        const amountDec = new Decimal(tx.amount || 0);
        if (amountDec.lte(0)) continue;

        const idempotencyKey = `RECON:${statementId}:${tx.rowIndex}`;
        const txType = tx.direction === 'in' ? 'income' : 'expense';

        const res = await recordFinancialTransaction(supabase as any, {
          userId: userData.user.id,
          type: txType,
          accountId,
          categoryId: tx.categoryId || null,
          amount: amountDec.toFixed(2),
          date: tx.date,
          description: tx.description || 'Imported Transaction',
          idempotencyKey,
          sourceType: 'reconciliation_import',
          sourceId: statementId,
          notes: tx.reference ? `[Ref: ${tx.reference}]` : undefined,
          metadata: {
            statementId,
            rowIndex: tx.rowIndex,
            reference: tx.reference,
          },
        });

        results.push(res);
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_statement_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}
