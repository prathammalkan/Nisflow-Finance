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
          user_id: string
          display_name: string | null
          full_name?: string | null
          email?: string | null
          avatar_url?: string | null
          currency: string
          timezone: string
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          display_name?: string | null
          full_name?: string | null
          email?: string | null
          avatar_url?: string | null
          currency?: string
          timezone?: string
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          display_name?: string | null
          full_name?: string | null
          email?: string | null
          avatar_url?: string | null
          currency?: string
          timezone?: string
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          account_type: string
          type?: AccountType | string
          balance: number
          opening_balance: number
          current_balance: number
          currency: string
          is_active: boolean
          institution: string | null
          purpose: string | null
          account_number_last4: string | null
          color: string | null
          icon: string | null
          sort_order: number | null
          last_reconciled_at?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          account_type?: string
          type?: AccountType | string
          balance?: number
          opening_balance?: number
          current_balance?: number
          currency?: string
          is_active?: boolean
          institution?: string | null
          purpose?: string | null
          account_number_last4?: string | null
          color?: string | null
          icon?: string | null
          sort_order?: number | null
          last_reconciled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          account_type?: string
          type?: AccountType | string
          balance?: number
          opening_balance?: number
          current_balance?: number
          currency?: string
          is_active?: boolean
          institution?: string | null
          purpose?: string | null
          account_number_last4?: string | null
          color?: string | null
          icon?: string | null
          sort_order?: number | null
          last_reconciled_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          date: string
          time: string | null
          account_id: string
          to_account_id?: string | null
          amount: number
          direction: 'in' | 'out' | Direction
          transaction_type: string
          type?: TransactionType | string
          category_id: string | null
          subcategory_id: string | null
          description: string
          counterparty_id: string | null
          ownership: string
          payment_method: string | null
          upi_reference: string | null
          bank_reference: string | null
          linked_transaction_id: string | null
          related_person_id: string | null
          related_ipo_id: string | null
          related_investment_id: string | null
          notes: string | null
          reconciliation_status: string
          status: string | TransactionStatus
          is_deleted: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          time?: string | null
          account_id: string
          to_account_id?: string | null
          amount: number
          direction: 'in' | 'out' | Direction
          transaction_type?: string
          type?: TransactionType | string
          category_id?: string | null
          subcategory_id?: string | null
          description: string
          counterparty_id?: string | null
          ownership?: string
          payment_method?: string | null
          upi_reference?: string | null
          bank_reference?: string | null
          linked_transaction_id?: string | null
          related_person_id?: string | null
          related_ipo_id?: string | null
          related_investment_id?: string | null
          notes?: string | null
          reconciliation_status?: string
          status?: string | TransactionStatus
          is_deleted?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          time?: string | null
          account_id?: string
          to_account_id?: string | null
          amount?: number
          direction?: 'in' | 'out' | Direction
          transaction_type?: string
          type?: TransactionType | string
          category_id?: string | null
          subcategory_id?: string | null
          description?: string
          counterparty_id?: string | null
          ownership?: string
          payment_method?: string | null
          upi_reference?: string | null
          bank_reference?: string | null
          linked_transaction_id?: string | null
          related_person_id?: string | null
          related_ipo_id?: string | null
          related_investment_id?: string | null
          notes?: string | null
          reconciliation_status?: string
          status?: string | TransactionStatus
          is_deleted?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          user_id: string | null
          name: string
          type: TransactionType | string
          icon: string | null
          color: string | null
          parent_id: string | null
          is_system?: boolean | null
          sort_order?: number | null
          created_at: string
          updated_at?: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          type: TransactionType | string
          icon?: string | null
          color?: string | null
          parent_id?: string | null
          is_system?: boolean | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          type?: TransactionType | string
          icon?: string | null
          color?: string | null
          parent_id?: string | null
          is_system?: boolean | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      transaction_categories: {
        Row: {
          id: string
          user_id: string | null
          name: string
          type: TransactionType | string
          icon: string | null
          color: string | null
          is_system: boolean
          parent_id: string | null
          sort_order: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          type: TransactionType | string
          icon?: string | null
          color?: string | null
          is_system?: boolean
          parent_id?: string | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          type?: TransactionType | string
          icon?: string | null
          color?: string | null
          is_system?: boolean
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
          relationship: string | null
          phone: string | null
          email: string | null
          notes: string | null
          is_active: boolean
          type?: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          relationship?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          is_active?: boolean
          type?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          relationship?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          is_active?: boolean
          type?: string
          created_at?: string
          updated_at?: string
        }
      }
      receivables: {
        Row: {
          id: string
          user_id: string
          counterparty_id: string
          original_amount: number
          amount?: number
          amount_received: number
          received_amount?: number
          remaining: number
          due_date: string | null
          reason: string | null
          status: string
          related_transaction_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          counterparty_id: string
          original_amount: number
          amount?: number
          amount_received?: number
          received_amount?: number
          due_date?: string | null
          reason?: string | null
          status?: string
          related_transaction_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          counterparty_id?: string
          original_amount?: number
          amount?: number
          amount_received?: number
          received_amount?: number
          due_date?: string | null
          reason?: string | null
          status?: string
          related_transaction_id?: string | null
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
          original_amount: number
          amount?: number
          amount_paid: number
          paid_amount?: number
          remaining: number
          due_date: string | null
          reason: string | null
          status: string
          related_transaction_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          counterparty_id: string
          original_amount: number
          amount?: number
          amount_paid?: number
          paid_amount?: number
          due_date?: string | null
          reason?: string | null
          status?: string
          related_transaction_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          counterparty_id?: string
          original_amount?: number
          amount?: number
          amount_paid?: number
          paid_amount?: number
          due_date?: string | null
          reason?: string | null
          status?: string
          related_transaction_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      loans: {
        Row: {
          id: string
          user_id: string
          counterparty_id?: string | null
          name: string | null
          type?: string | null
          loan_type?: string | null
          lender_name?: string | null
          principal?: number | null
          principal_amount: number
          interest_rate: number
          amount_repaid?: number | null
          remaining?: number | null
          remaining_principal: number | null
          outstanding_balance?: number | null
          tenure_months?: number | null
          start_date: string | null
          due_date?: string | null
          status: string
          is_deleted: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          counterparty_id?: string | null
          name?: string | null
          type?: string | null
          loan_type?: string | null
          lender_name?: string | null
          principal?: number | null
          principal_amount: number
          interest_rate?: number
          amount_repaid?: number | null
          remaining_principal?: number | null
          outstanding_balance?: number | null
          tenure_months?: number | null
          start_date?: string | null
          due_date?: string | null
          status?: string
          is_deleted?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          counterparty_id?: string | null
          name?: string | null
          type?: string | null
          loan_type?: string | null
          lender_name?: string | null
          principal?: number | null
          principal_amount?: number
          interest_rate?: number
          amount_repaid?: number | null
          remaining_principal?: number | null
          outstanding_balance?: number | null
          tenure_months?: number | null
          start_date?: string | null
          due_date?: string | null
          status?: string
          is_deleted?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      third_party_funds: {
        Row: {
          id: string
          user_id: string
          counterparty_id: string
          owner_name?: string | null
          amount?: number | null
          amount_received: number
          purpose: string | null
          date_received: string
          amount_used: number
          amount_refunded: number
          amount_returned: number
          outstanding: number
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          counterparty_id: string
          owner_name?: string | null
          amount?: number | null
          amount_received: number
          purpose?: string | null
          date_received: string
          amount_used?: number
          amount_refunded?: number
          amount_returned?: number
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          counterparty_id?: string
          owner_name?: string | null
          amount?: number | null
          amount_received?: number
          purpose?: string | null
          date_received?: string
          amount_used?: number
          amount_refunded?: number
          amount_returned?: number
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      ipos: {
        Row: {
          id: string
          user_id: string
          name: string
          company: string
          symbol: string | null
          open_date: string
          close_date: string
          listing_date: string | null
          price_band_low: number
          price_band_high: number
          lot_size: number
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          company: string
          symbol?: string | null
          open_date: string
          close_date: string
          listing_date?: string | null
          price_band_low: number
          price_band_high: number
          lot_size: number
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          company?: string
          symbol?: string | null
          open_date?: string
          close_date?: string
          listing_date?: string | null
          price_band_low?: number
          price_band_high?: number
          lot_size?: number
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      ipo_applications: {
        Row: {
          id: string
          user_id: string
          ipo_id: string
          applicant_name: string
          fund_owner: string
          counterparty_id: string | null
          funding_source_account_id: string | null
          application_amount: number
          application_date: string
          broker: string | null
          demat_account: string | null
          upi_mandate_id: string | null
          application_number: string | null
          category: string
          allotment_status: string
          shares_allotted: number
          amount_debited: number
          refund_amount: number
          refund_date: string | null
          refund_account_id: string | null
          sale_proceeds: number
          charges: number
          amount_returned: number
          date_returned: string | null
          outstanding_amount: number
          status: string
          lots_applied?: number | null
          amount_blocked?: number | null
          allotted_shares?: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ipo_id: string
          applicant_name: string
          fund_owner?: string
          counterparty_id?: string | null
          funding_source_account_id?: string | null
          application_amount: number
          application_date: string
          broker?: string | null
          demat_account?: string | null
          upi_mandate_id?: string | null
          application_number?: string | null
          category?: string
          allotment_status?: string
          shares_allotted?: number
          amount_debited?: number
          refund_amount?: number
          refund_date?: string | null
          refund_account_id?: string | null
          sale_proceeds?: number
          charges?: number
          amount_returned?: number
          date_returned?: string | null
          outstanding_amount?: number
          status?: string
          lots_applied?: number | null
          amount_blocked?: number | null
          allotted_shares?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ipo_id?: string
          applicant_name?: string
          fund_owner?: string
          counterparty_id?: string | null
          funding_source_account_id?: string | null
          application_amount?: number
          application_date?: string
          broker?: string | null
          demat_account?: string | null
          upi_mandate_id?: string | null
          application_number?: string | null
          category?: string
          allotment_status?: string
          shares_allotted?: number
          amount_debited?: number
          refund_amount?: number
          refund_date?: string | null
          refund_account_id?: string | null
          sale_proceeds?: number
          charges?: number
          amount_returned?: number
          date_returned?: string | null
          outstanding_amount?: number
          status?: string
          lots_applied?: number | null
          amount_blocked?: number | null
          allotted_shares?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      investments: {
        Row: {
          id: string
          user_id: string
          name: string
          asset_type: string
          asset_class?: string
          symbol: string | null
          ticker?: string | null
          quantity: number
          units?: number
          purchase_date: string | null
          purchase_price: number
          avg_purchase_price?: number
          total_invested: number
          invested_amount?: number
          current_value: number
          current_price: number
          last_price_update: string | null
          account_id: string | null
          broker: string | null
          demat_account: string | null
          platform?: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          asset_type?: string
          asset_class?: string
          symbol?: string | null
          ticker?: string | null
          quantity?: number
          units?: number
          purchase_date?: string | null
          purchase_price?: number
          avg_purchase_price?: number
          total_invested?: number
          invested_amount?: number
          current_value?: number
          current_price?: number
          last_price_update?: string | null
          account_id?: string | null
          broker?: string | null
          demat_account?: string | null
          platform?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          asset_type?: string
          asset_class?: string
          symbol?: string | null
          ticker?: string | null
          quantity?: number
          units?: number
          purchase_date?: string | null
          purchase_price?: number
          avg_purchase_price?: number
          total_invested?: number
          invested_amount?: number
          current_value?: number
          current_price?: number
          last_price_update?: string | null
          account_id?: string | null
          broker?: string | null
          demat_account?: string | null
          platform?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      investment_transactions: {
        Row: {
          id: string
          user_id: string
          investment_id: string
          type: string
          date: string
          quantity: number
          units?: number
          price: number
          price_per_unit?: number
          amount: number
          total_amount?: number
          fees: number
          taxes: number
          account_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          investment_id: string
          type: string
          date: string
          quantity: number
          units?: number
          price: number
          price_per_unit?: number
          amount: number
          total_amount?: number
          fees?: number
          taxes?: number
          account_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          investment_id?: string
          type?: string
          date?: string
          quantity?: number
          units?: number
          price?: number
          price_per_unit?: number
          amount?: number
          total_amount?: number
          fees?: number
          taxes?: number
          account_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          month: number
          year: number
          total_budget: number
          name?: string | null
          total_amount?: number | null
          period?: string | null
          start_date?: string | null
          end_date?: string | null
          category?: string | null
          allocated_amount?: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month?: number
          year?: number
          total_budget?: number
          name?: string | null
          total_amount?: number | null
          period?: string | null
          start_date?: string | null
          end_date?: string | null
          category?: string | null
          allocated_amount?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          month?: number
          year?: number
          total_budget?: number
          name?: string | null
          total_amount?: number | null
          period?: string | null
          start_date?: string | null
          end_date?: string | null
          category?: string | null
          allocated_amount?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      budget_categories: {
        Row: {
          id: string
          budget_id: string
          category_id: string
          allocated_amount: number
          spent_amount: number
          amount?: number
          created_at?: string
        }
        Insert: {
          id?: string
          budget_id: string
          category_id: string
          allocated_amount: number
          spent_amount?: number
          amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          budget_id?: string
          category_id?: string
          allocated_amount?: number
          spent_amount?: number
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
          monthly_contribution: number | null
          account_id: string | null
          icon: string | null
          color: string | null
          status: string
          notes: string | null
          deleted_at?: string | null
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
          monthly_contribution?: number | null
          account_id?: string | null
          icon?: string | null
          color?: string | null
          status?: string
          notes?: string | null
          deleted_at?: string | null
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
          monthly_contribution?: number | null
          account_id?: string | null
          icon?: string | null
          color?: string | null
          status?: string
          notes?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          name: string
          file_name?: string | null
          file_path: string
          file_url?: string | null
          file_type: string | null
          mime_type?: string | null
          file_size: number | null
          entity_type: string | null
          entity_id: string | null
          description: string | null
          uploaded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          file_name?: string | null
          file_path: string
          file_url?: string | null
          file_type?: string | null
          mime_type?: string | null
          file_size?: number | null
          entity_type?: string | null
          entity_id?: string | null
          description?: string | null
          uploaded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          file_name?: string | null
          file_path?: string
          file_url?: string | null
          file_type?: string | null
          mime_type?: string | null
          file_size?: number | null
          entity_type?: string | null
          entity_id?: string | null
          description?: string | null
          uploaded_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bank_statements: {
        Row: {
          id: string
          user_id: string
          account_id: string
          file_path: string
          file_name: string
          filename?: string
          month?: string | null
          file_url?: string | null
          is_reconciled?: boolean
          period_start: string | null
          period_end: string | null
          opening_balance: number | null
          closing_balance: number | null
          total_rows?: number | null
          imported_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          file_path: string
          file_name: string
          filename?: string
          month?: string | null
          file_url?: string | null
          is_reconciled?: boolean
          period_start?: string | null
          period_end?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          total_rows?: number | null
          imported_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          file_path?: string
          file_name?: string
          filename?: string
          month?: string | null
          file_url?: string | null
          is_reconciled?: boolean
          period_start?: string | null
          period_end?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          total_rows?: number | null
          imported_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      bank_statement_transactions: {
        Row: {
          id: string
          statement_id: string
          date: string
          description: string
          amount: number
          direction: 'in' | 'out' | Direction
          balance: number | null
          reference: string | null
          reference_number?: string | null
          is_matched: boolean
          matched_transaction_id: string | null
          is_duplicate: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          statement_id: string
          date: string
          description: string
          amount: number
          direction: 'in' | 'out' | Direction
          balance?: number | null
          reference?: string | null
          reference_number?: string | null
          is_matched?: boolean
          matched_transaction_id?: string | null
          is_duplicate?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          statement_id?: string
          date?: string
          description?: string
          amount?: number
          direction?: 'in' | 'out' | Direction
          balance?: number | null
          reference?: string | null
          reference_number?: string | null
          is_matched?: boolean
          matched_transaction_id?: string | null
          is_duplicate?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      reconciliations: {
        Row: {
          id: string
          user_id: string
          account_id: string
          statement_id?: string | null
          date: string
          statement_balance: number
          ledger_balance: number
          difference: number
          status: string
          matched_count: number
          unmatched_count: number
          notes: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          statement_id?: string | null
          date: string
          statement_balance: number
          ledger_balance: number
          difference: number
          status?: string
          matched_count?: number
          unmatched_count?: number
          notes?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          statement_id?: string | null
          date?: string
          statement_balance?: number
          ledger_balance?: number
          difference?: number
          status?: string
          matched_count?: number
          unmatched_count?: number
          notes?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      monthly_closings: {
        Row: {
          id: string
          user_id: string
          month: number | string
          year: number
          total_income?: number | null
          total_expense?: number | null
          net_worth?: number | null
          is_closed?: boolean
          status: string
          closed_at: string | null
          reopened_at: string | null
          reopen_reason: string | null
          checklist: Json | null
          notes?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month: number | string
          year: number
          total_income?: number | null
          total_expense?: number | null
          net_worth?: number | null
          is_closed?: boolean
          status?: string
          closed_at?: string | null
          reopened_at?: string | null
          reopen_reason?: string | null
          checklist?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          month?: number | string
          year?: number
          total_income?: number | null
          total_expense?: number | null
          net_worth?: number | null
          is_closed?: boolean
          status?: string
          closed_at?: string | null
          reopened_at?: string | null
          reopen_reason?: string | null
          checklist?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          timestamp: string
          action: string
          entity_type: string
          entity_id: string | null
          old_value: Json | null
          new_value: Json | null
          details: Json | null
          reason: string | null
          ip_address: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          timestamp?: string
          action: string
          entity_type: string
          entity_id?: string | null
          old_value?: Json | null
          new_value?: Json | null
          details?: Json | null
          reason?: string | null
          ip_address?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          timestamp?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          old_value?: Json | null
          new_value?: Json | null
          details?: Json | null
          reason?: string | null
          ip_address?: string | null
          created_at?: string
          updated_at?: string
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
          description?: string | null
          link?: string | null
          type: string
          entity_type: string | null
          entity_id: string | null
          is_read: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          description?: string | null
          link?: string | null
          type: string
          entity_type?: string | null
          entity_id?: string | null
          is_read?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          message?: string
          description?: string | null
          link?: string | null
          type?: string
          entity_type?: string | null
          entity_id?: string | null
          is_read?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      transaction_tags: {
        Row: {
          transaction_id: string
          tag_id: string
        }
        Insert: {
          transaction_id: string
          tag_id: string
        }
        Update: {
          transaction_id?: string
          tag_id?: string
        }
      }
      transfers: {
        Row: {
          id: string
          user_id: string
          from_transaction_id: string
          to_transaction_id: string
          amount: number
          date: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          from_transaction_id: string
          to_transaction_id: string
          amount: number
          date: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          from_transaction_id?: string
          to_transaction_id?: string
          amount?: number
          date?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tax_records: {
        Row: {
          id: string
          user_id: string
          financial_year: string
          type: string
          record_type?: string | null
          description: string | null
          amount: number
          category: string | null
          document_id: string | null
          details: Json | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financial_year: string
          type: string
          record_type?: string | null
          description?: string | null
          amount: number
          category?: string | null
          document_id?: string | null
          details?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financial_year?: string
          type?: string
          record_type?: string | null
          description?: string | null
          amount?: number
          category?: string | null
          document_id?: string | null
          details?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      split_expenses: {
        Row: {
          id: string
          user_id: string
          description: string
          total_amount: number
          date: string
          category_id: string | null
          account_id: string | null
          transaction_id: string | null
          group_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          description: string
          total_amount: number
          date: string
          category_id?: string | null
          account_id?: string | null
          transaction_id?: string | null
          group_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          description?: string
          total_amount?: number
          date?: string
          category_id?: string | null
          account_id?: string | null
          transaction_id?: string | null
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
          share_amount: number
          amount?: number
          is_paid: boolean
          is_settled?: boolean
          payment_transaction_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          split_expense_id: string
          user_id?: string | null
          counterparty_id?: string | null
          share_amount: number
          amount?: number
          is_paid?: boolean
          is_settled?: boolean
          payment_transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          split_expense_id?: string
          user_id?: string | null
          counterparty_id?: string | null
          share_amount?: number
          amount?: number
          is_paid?: boolean
          is_settled?: boolean
          payment_transaction_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      recurring_transactions: {
        Row: {
          id: string
          user_id: string
          account_id: string | null
          category_id: string | null
          counterparty_id: string | null
          description: string
          amount: number
          type: string
          direction: 'in' | 'out' | Direction
          ownership: string
          frequency: string
          start_date: string
          end_date: string | null
          next_due_date: string
          last_created_date: string | null
          notes: string | null
          is_active: boolean
          auto_create: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id?: string | null
          category_id?: string | null
          counterparty_id?: string | null
          description: string
          amount: number
          type: string
          direction: 'in' | 'out' | Direction
          ownership?: string
          frequency: string
          start_date: string
          end_date?: string | null
          next_due_date: string
          last_created_date?: string | null
          notes?: string | null
          is_active?: boolean
          auto_create?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string | null
          category_id?: string | null
          counterparty_id?: string | null
          description?: string
          amount?: number
          type?: string
          direction?: 'in' | 'out' | Direction
          ownership?: string
          frequency?: string
          start_date?: string
          end_date?: string | null
          next_due_date?: string
          last_created_date?: string | null
          notes?: string | null
          is_active?: boolean
          auto_create?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      net_worth_snapshots: {
        Row: {
          id: string
          user_id: string
          snapshot_date: string
          period: string
          personal_cash: number
          savings: number
          investments: number
          receivables: number
          payables: number
          third_party_held: number
          net_worth: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          snapshot_date: string
          period: string
          personal_cash?: number
          savings?: number
          investments?: number
          receivables?: number
          payables?: number
          third_party_held?: number
          net_worth: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          snapshot_date?: string
          period?: string
          personal_cash?: number
          savings?: number
          investments?: number
          receivables?: number
          payables?: number
          third_party_held?: number
          net_worth?: number
          created_at?: string
        }
      }
      net_worth_history: {
        Row: {
          id?: string
          user_id: string
          date: string
          snapshot_date?: string
          personal_cash: number
          savings: number
          investments: number
          receivables: number
          payables: number
          third_party_held: number
          total_net_worth: number
          net_worth?: number
          created_at?: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          snapshot_date?: string
          personal_cash?: number
          savings?: number
          investments?: number
          receivables?: number
          payables?: number
          third_party_held?: number
          total_net_worth: number
          net_worth?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          snapshot_date?: string
          personal_cash?: number
          savings?: number
          investments?: number
          receivables?: number
          payables?: number
          third_party_held?: number
          total_net_worth?: number
          net_worth?: number
          created_at?: string
        }
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
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
          }> | Json
          p_created_by: string
          p_metadata?: Record<string, any> | Json
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
          p_metadata?: Record<string, any> | Json
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
      preview_user_data_reset: {
        Args: Record<string, never>
        Returns: {
          totalRecords: number
          breakdown: Record<string, number>
        }
      }
      reset_user_data: {
        Args: {
          p_reset_id: string
          p_confirmation_phrase: string
        }
        Returns: {
          success: boolean
          idempotent?: boolean
          resetId: string
          totalDeleted: number
          deletedCounts: Record<string, number>
          verified: boolean
          message?: string
        }
      }
      get_transaction_stats: {
        Args: {
          p_month?: number | null
          p_year?: number | null
        }
        Returns: Json
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Account = Database['public']['Tables']['accounts']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type TransactionCategory = Database['public']['Tables']['transaction_categories']['Row'];
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
export type BankStatementTransaction = Database['public']['Tables']['bank_statement_transactions']['Row'];
export type Reconciliation = Database['public']['Tables']['reconciliations']['Row'];
export type MonthlyClosing = Database['public']['Tables']['monthly_closings']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type AutomationRule = Database['public']['Tables']['automation_rules']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type Tag = Database['public']['Tables']['tags']['Row'];
export type TransactionTag = Database['public']['Tables']['transaction_tags']['Row'];
export type Transfer = Database['public']['Tables']['transfers']['Row'];
export type TaxRecord = Database['public']['Tables']['tax_records']['Row'];
export type SplitExpense = Database['public']['Tables']['split_expenses']['Row'];
export type SplitExpenseShare = Database['public']['Tables']['split_expense_shares']['Row'];
export type RecurringTransaction = Database['public']['Tables']['recurring_transactions']['Row'];
export type NetWorthSnapshot = Database['public']['Tables']['net_worth_snapshots']['Row'];
export type NetWorthHistory = Database['public']['Tables']['net_worth_history']['Row'];
export type PushSubscription = Database['public']['Tables']['push_subscriptions']['Row'];
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

