CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  period TEXT NOT NULL, -- 'YYYY-MM' format for monthly grouping
  personal_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  savings DECIMAL(15,2) NOT NULL DEFAULT 0,
  investments DECIMAL(15,2) NOT NULL DEFAULT 0,
  receivables DECIMAL(15,2) NOT NULL DEFAULT 0,
  payables DECIMAL(15,2) NOT NULL DEFAULT 0,
  third_party_held DECIMAL(15,2) NOT NULL DEFAULT 0,
  net_worth DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period)
);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own snapshots"
  ON public.net_worth_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_net_worth_snapshots_user_period ON public.net_worth_snapshots(user_id, period);
