export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: AccountType
          balance: number
          currency: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: AccountType
          balance?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: AccountType
          balance?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          account_id: string
          category_id: string | null
          amount: number
          type: TransactionType
          status: TransactionStatus
          direction: Direction
          date: string
          description: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          category_id?: string | null
          amount: number
          type: TransactionType
          status?: TransactionStatus
          direction: Direction
          date: string
          description?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          category_id?: string | null
          amount?: number
          type?: TransactionType
          status?: TransactionStatus
          direction?: Direction
          date?: string
          description?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          type: TransactionType
          icon: string | null
          color: string | null
          parent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: TransactionType
          icon?: string | null
          color?: string | null
          parent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: TransactionType
          icon?: string | null
          color?: string | null
          parent_id?: string | null
          created_at?: string
        }
      }
      transaction_categories: {
        Row: {
          id: string
          user_id: string | null
          name: string
          type: TransactionType | string | null
          icon: string | null
          color: string | null
          is_system: boolean | null
          parent_id: string | null
          sort_order: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          type?: TransactionType | string | null
          icon?: string | null
          color?: string | null
          is_system?: boolean | null
          parent_id?: string | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          type?: TransactionType | string | null
          icon?: string | null
          color?: string | null
          is_system?: boolean | null
          parent_id?: string | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      counterparties: {
        Row: {
          id: string
          user_id: string
          name: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: string
          created_at?: string
        }
      }
      receivables: {
        Row: {
          id: string
          user_id: string
          counterparty_id: string
          amount: number
          due_date: string | null
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          counterparty_id: string
          amount: number
          due_date?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          counterparty_id?: string
          amount?: number
          due_date?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payables: {
        Row: {
          id: string
          user_id: string
          counterparty_id: string
          amount: number
          due_date: string | null
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          counterparty_id: string
          amount: number
          due_date?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          counterparty_id?: string
          amount?: number
          due_date?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      loans: {
        Row: {
          id: string
          user_id: string
          name: string
          principal_amount: number
          interest_rate: number
          outstanding_balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          principal_amount: number
          interest_rate: number
          outstanding_balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          principal_amount?: number
          interest_rate?: number
          outstanding_balance?: number
          created_at?: string
          updated_at?: string
        }
      }
      third_party_funds: {
        Row: {
          id: string
          user_id: string
          owner_name: string
          amount: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          owner_name: string
          amount: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          owner_name?: string
          amount?: number
          notes?: string | null
          created_at?: string
        }
      }
      ipos: {
        Row: {
          id: string
          name: string
          symbol: string
          open_date: string
          close_date: string
          price_band_low: number
          price_band_high: number
          lot_size: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          symbol: string
          open_date: string
          close_date: string
          price_band_low: number
          price_band_high: number
          lot_size: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          symbol?: string
          open_date?: string
          close_date?: string
          price_band_low?: number
          price_band_high?: number
          lot_size?: number
          created_at?: string
        }
      }
      ipo_applications: {
        Row: {
          id: string
          user_id: string
          ipo_id: string
          lots_applied: number
          amount_blocked: number
          status: string
          allotted_shares: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ipo_id: string
          lots_applied: number
          amount_blocked: number
          status?: string
          allotted_shares?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ipo_id?: string
          lots_applied?: number
          amount_blocked?: number
          status?: string
          allotted_shares?: number
          created_at?: string
          updated_at?: string
        }
      }
      investments: {
        Row: {
          id: string
          user_id: string
          name: string
          symbol: string | null
          asset_class: string
          current_value: number
          invested_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          symbol?: string | null
          asset_class: string
          current_value?: number
          invested_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          symbol?: string | null
          asset_class?: string
          current_value?: number
          invested_amount?: number
          created_at?: string
          updated_at?: string
        }
      }
      investment_transactions: {
        Row: {
          id: string
          investment_id: string
          type: string
          units: number
          price_per_unit: number
          total_amount: number
          date: string
          created_at: string
        }
        Insert: {
          id?: string
          investment_id: string
          type: string
          units: number
          price_per_unit: number
          total_amount: number
          date: string
          created_at?: string
        }
        Update: {
          id?: string
          investment_id?: string
          type?: string
          units?: number
          price_per_unit?: number
          total_amount?: number
          date?: string
          created_at?: string
        }
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          name: string
          total_amount: number
          period: string
          start_date: string
          end_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          total_amount: number
          period: string
          start_date: string
          end_date: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          total_amount?: number
          period?: string
          start_date?: string
          end_date?: string
          created_at?: string
          updated_at?: string
        }
      }
      budget_categories: {
        Row: {
          id: string
          budget_id: string
          category_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          budget_id: string
          category_id: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          budget_id?: string
          category_id?: string
          amount?: number
          created_at?: string
        }
      }
      savings_goals: {
        Row: {
          id: string
          user_id: string
          name: string
          target_amount: number
          current_amount: number
          deadline: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          target_amount: number
          current_amount?: number
          deadline?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          target_amount?: number
          current_amount?: number
          deadline?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          name: string
          file_path: string | null
          file_url: string | null
          file_type: string | null
          file_size: number | null
          entity_type: string | null
          entity_id: string | null
          description: string | null
          created_at: string
          uploaded_at?: string | null
          updated_at?: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          file_path?: string | null
          file_url?: string | null
          file_type?: string | null
          file_size?: number | null
          entity_type?: string | null
          entity_id?: string | null
          description?: string | null
          created_at?: string
          uploaded_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          file_path?: string | null
          file_url?: string | null
          file_type?: string | null
          file_size?: number | null
          entity_type?: string | null
          entity_id?: string | null
          description?: string | null
          created_at?: string
          uploaded_at?: string | null
          updated_at?: string | null
        }
      }
      bank_statements: {
        Row: {
          id: string
          account_id: string
          month: string
          file_url: string
          is_reconciled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          account_id: string
          month: string
          file_url: string
          is_reconciled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          month?: string
          file_url?: string
          is_reconciled?: boolean
          created_at?: string
        }
      }
      reconciliations: {
        Row: {
          id: string
          account_id: string
          statement_id: string
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          statement_id: string
          status: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          statement_id?: string
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      monthly_closings: {
        Row: {
          id: string
          user_id: string
          month: string
          total_income: number
          total_expense: number
          net_worth: number
          is_closed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month: string
          total_income: number
          total_expense: number
          net_worth: number
          is_closed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          month?: string
          total_income?: number
          total_expense?: number
          net_worth?: number
          is_closed?: boolean
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          entity_type: string
          entity_id: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          entity_type: string
          entity_id: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          entity_type?: string
          entity_id?: string
          details?: Json | null
          created_at?: string
        }
      }
      automation_rules: {
        Row: {
          id: string
          user_id: string
          name: string
          conditions: Json
          actions: Json
          is_active: boolean
          priority: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          conditions: Json
          actions: Json
          is_active?: boolean
          priority?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          conditions?: Json
          actions?: Json
          is_active?: boolean
          priority?: number
          created_at?: string
          updated_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          type: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          type: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          message?: string
          type?: string
          is_read?: boolean
          created_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string | null
          created_at?: string
        }
      }
      tax_records: {
        Row: {
          id: string
          user_id: string
          financial_year: string
          type: string
          amount: number
          details: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financial_year: string
          type: string
          amount: number
          details?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financial_year?: string
          type?: string
          amount?: number
          details?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      split_expenses: {
        Row: {
          id: string
          transaction_id: string
          total_amount: number
          group_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          total_amount: number
          group_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          transaction_id?: string
          total_amount?: number
          group_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      split_expense_shares: {
        Row: {
          id: string
          split_expense_id: string
          user_id: string | null
          counterparty_id: string | null
          amount: number
          is_settled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          split_expense_id: string
          user_id?: string | null
          counterparty_id?: string | null
          amount: number
          is_settled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          split_expense_id?: string
          user_id?: string | null
          counterparty_id?: string | null
          amount?: number
          is_settled?: boolean
          created_at?: string
        }
      }
      ledger_accounts: {
        Row: {
          id: string
          user_id: string
          code: string
          name: string
          account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
          entity_type: string | null
          entity_id: string | null
          currency: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          code: string
          name: string
          account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
          entity_type?: string | null
          entity_id?: string | null
          currency?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          code?: string
          name?: string
          account_type?: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
          entity_type?: string | null
          entity_id?: string | null
          currency?: string
          is_active?: boolean
          created_at?: string
        }
      }
      journal_entries: {
        Row: {
          id: string
          user_id: string
          entry_number: number
          transaction_date: string
          posted_at: string
          description: string
          source_type: string
          source_id: string | null
          idempotency_key: string
          status: 'posted' | 'reversed'
          reversal_of_id: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entry_number?: number
          transaction_date: string
          posted_at?: string
          description: string
          source_type: string
          source_id?: string | null
          idempotency_key: string
          status?: 'posted' | 'reversed'
          reversal_of_id?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entry_number?: number
          transaction_date?: string
          posted_at?: string
          description?: string
          source_type?: string
          source_id?: string | null
          idempotency_key?: string
          status?: 'posted' | 'reversed'
          reversal_of_id?: string | null
          created_by?: string
          created_at?: string
        }
      }
      journal_lines: {
        Row: {
          id: string
          journal_entry_id: string
          ledger_account_id: string
          user_id: string
          debit_amount: number
          credit_amount: number
          currency: string
          memo: string | null
          created_at: string
        }
        Insert: {
          id?: string
          journal_entry_id: string
          ledger_account_id: string
          user_id: string
          debit_amount?: number
          credit_amount?: number
          currency?: string
          memo?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          journal_entry_id?: string
          ledger_account_id?: string
          user_id?: string
          debit_amount?: number
          credit_amount?: number
          currency?: string
          memo?: string | null
          created_at?: string
        }
      }
      ledger_audit_log: {
        Row: {
          id: string
          user_id: string
          journal_entry_id: string
          action: string
          actor_id: string
          payload_hash: string
          metadata: Record<string, any>
          timestamp: string
        }
        Insert: {
          id?: string
          user_id: string
          journal_entry_id: string
          action: string
          actor_id: string
          payload_hash: string
          metadata?: Record<string, any>
          timestamp?: string
        }
        Update: {
          id?: string
          user_id?: string
          journal_entry_id?: string
          action?: string
          actor_id?: string
          payload_hash?: string
          metadata?: Record<string, any>
          timestamp?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      post_journal_entry: {
        Args: {
          p_user_id: string
          p_transaction_date: string
          p_description: string
          p_source_type: string
          p_source_id: string | null
          p_idempotency_key: string
          p_lines: Array<{
            ledger_account_id: string
            debit_amount: number
            credit_amount: number
            currency?: string
            memo?: string
          }>
          p_created_by: string
          p_metadata?: Record<string, any>
        }
        Returns: string
      }
      post_reversal_entry: {
        Args: {
          p_user_id: string
          p_original_entry_id: string
          p_reason: string
          p_idempotency_key: string
          p_created_by: string
          p_metadata?: Record<string, any>
        }
        Returns: string
      }
      get_ledger_account_balance: {
        Args: {
          p_ledger_account_id: string
        }
        Returns: number
      }
      reconcile_ledger_balances: {
        Args: {
          p_user_id: string
        }
        Returns: Array<{
          account_id: string
          account_name: string
          cached_balance: number
          ledger_balance: number
          discrepancy: number
          is_reconciled: boolean
        }>
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Account = Database['public']['Tables']['accounts']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Counterparty = Database['public']['Tables']['counterparties']['Row'];
export type Receivable = Database['public']['Tables']['receivables']['Row'];
export type Payable = Database['public']['Tables']['payables']['Row'];
export type Loan = Database['public']['Tables']['loans']['Row'];
export type ThirdPartyFund = Database['public']['Tables']['third_party_funds']['Row'];
export type IPO = Database['public']['Tables']['ipos']['Row'];
export type IPOApplication = Database['public']['Tables']['ipo_applications']['Row'];
export type Investment = Database['public']['Tables']['investments']['Row'];
export type InvestmentTransaction = Database['public']['Tables']['investment_transactions']['Row'];
export type Budget = Database['public']['Tables']['budgets']['Row'];
export type BudgetCategory = Database['public']['Tables']['budget_categories']['Row'];
export type SavingsGoal = Database['public']['Tables']['savings_goals']['Row'];
export type Document = Database['public']['Tables']['documents']['Row'];
export type BankStatement = Database['public']['Tables']['bank_statements']['Row'];
export type Reconciliation = Database['public']['Tables']['reconciliations']['Row'];
export type MonthlyClosing = Database['public']['Tables']['monthly_closings']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type AutomationRule = Database['public']['Tables']['automation_rules']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type Tag = Database['public']['Tables']['tags']['Row'];
export type TaxRecord = Database['public']['Tables']['tax_records']['Row'];
export type SplitExpense = Database['public']['Tables']['split_expenses']['Row'];
export type SplitExpenseShare = Database['public']['Tables']['split_expense_shares']['Row'];
export type LedgerAccount = Database['public']['Tables']['ledger_accounts']['Row'];
export type JournalEntry = Database['public']['Tables']['journal_entries']['Row'];
export type JournalLine = Database['public']['Tables']['journal_lines']['Row'];
export type LedgerAuditLog = Database['public']['Tables']['ledger_audit_log']['Row'];

export enum AccountType {
  CASH = 'CASH',
  BANK = 'BANK',
  CREDIT_CARD = 'CREDIT_CARD',
  WALLET = 'WALLET',
  INVESTMENT = 'INVESTMENT',
  LOAN = 'LOAN'
}

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
  INVESTMENT = 'INVESTMENT'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum Direction {
  IN = 'IN',
  OUT = 'OUT'
}

export enum Ownership {
  SELF = 'SELF',
  JOINT = 'JOINT',
  THIRD_PARTY = 'THIRD_PARTY'
}
