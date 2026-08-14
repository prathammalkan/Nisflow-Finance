import { Decimal } from 'decimal.js';
import { parseMoney, addMoney, subtractMoney, ZERO } from './money';

export function calculateNetWorth(
  assets: (number | string | Decimal)[],
  liabilities: (number | string | Decimal)[]
): Decimal {
  const totalAssets = assets.reduce<Decimal>((acc, val) => addMoney(acc, val), ZERO);
  const totalLiabilities = liabilities.reduce<Decimal>((acc, val) => addMoney(acc, val), ZERO);
  
  return subtractMoney(totalAssets, totalLiabilities);
}

export function calculateAvailableCash(
  cashAccounts: (number | string | Decimal)[]
): Decimal {
  return cashAccounts.reduce<Decimal>((acc, val) => addMoney(acc, val), ZERO);
}

export function calculateMonthlyStats(
  incomes: (number | string | Decimal)[],
  expenses: (number | string | Decimal)[]
): { totalIncome: Decimal; totalExpense: Decimal; savings: Decimal; savingsRate: Decimal } {
  const totalIncome = incomes.reduce<Decimal>((acc, val) => addMoney(acc, val), ZERO);
  const totalExpense = expenses.reduce<Decimal>((acc, val) => addMoney(acc, val), ZERO);
  const savings = subtractMoney(totalIncome, totalExpense);
  
  const savingsRate = totalIncome.isZero()
    ? ZERO
    : savings.dividedBy(totalIncome).times(100);

  return { totalIncome, totalExpense, savings, savingsRate };
}

export function calculateBudgetUsage(
  budgetAmount: number | string | Decimal,
  spentAmount: number | string | Decimal
): { remaining: Decimal; usagePercentage: Decimal; isOverBudget: boolean } {
  const budget = parseMoney(budgetAmount);
  const spent = parseMoney(spentAmount);
  
  const remaining = subtractMoney(budget, spent);
  const usagePercentage = budget.isZero()
    ? ZERO
    : spent.dividedBy(budget).times(100);
    
  return {
    remaining,
    usagePercentage,
    isOverBudget: spent.greaterThan(budget)
  };
}
