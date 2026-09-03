-- 002_seed_categories.sql
-- NisFlow Finance Initial Seed Data

-- Insert default system transaction categories
INSERT INTO public.transaction_categories (name, type, is_system, sort_order) VALUES
('Salary', 'income', true, 10),
('Freelance', 'income', true, 20),
('Interest', 'income', true, 30),
('Dividend', 'income', true, 40),
('Refund', 'income', true, 50),
('Gift', 'income', true, 60),
('Other Income', 'income', true, 70),
('Food', 'expense', true, 10),
('Transport', 'expense', true, 20),
('Shopping', 'expense', true, 30),
('Entertainment', 'expense', true, 40),
('Bills', 'expense', true, 50),
('Subscriptions', 'expense', true, 60),
('Education', 'expense', true, 70),
('Health', 'expense', true, 80),
('Travel', 'expense', true, 90),
('Rent', 'expense', true, 100),
('Groceries', 'expense', true, 110),
('Personal Care', 'expense', true, 120),
('Friends', 'expense', true, 130),
('Family', 'expense', true, 140),
('Other Expense', 'expense', true, 150),
('Internal Transfer', 'transfer', true, 10),
('Stocks', 'investment', true, 10),
('Mutual Funds', 'investment', true, 20),
('ETFs', 'investment', true, 30),
('IPO', 'investment', true, 40),
('Fixed Deposit', 'investment', true, 50),
('Bonds', 'investment', true, 60)
ON CONFLICT DO NOTHING;
