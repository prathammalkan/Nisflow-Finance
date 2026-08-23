CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  ownership TEXT NOT NULL DEFAULT 'personal' CHECK (ownership IN ('personal','third_party')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  last_created_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  auto_create BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring transactions"
  ON public.recurring_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_recurring_transactions_user_id ON public.recurring_transactions(user_id);
CREATE INDEX idx_recurring_transactions_next_due ON public.recurring_transactions(next_due_date) WHERE is_active = true;
