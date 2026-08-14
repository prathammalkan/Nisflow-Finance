import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

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
