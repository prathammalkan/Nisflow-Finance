'use client';

import Decimal from 'decimal.js';
import { formatINR } from '@/lib/finance/money';
import { cn } from '@/lib/utils';

interface TransactionSummaryBarProps {
  transactions: any[];
  totalCount?: number;
}

export function TransactionSummaryBar({ transactions, totalCount }: TransactionSummaryBarProps) {
  if (!transactions || transactions.length === 0) return null;

  let income = new Decimal(0);
  let expenses = new Decimal(0);

  transactions.forEach((tx) => {
    const type = tx.type?.toLowerCase();
    const amt = new Decimal(tx.amount || 0);
    if (type === 'income') income = income.plus(amt);
    if (type === 'expense') expenses = expenses.plus(amt);
  });

  const net = income.minus(expenses);
  const isPositive = net.gte(0);
  const displayTotal = totalCount ?? transactions.length;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm py-2 px-1 border-b border-border mb-1">
      <span className="text-muted-foreground">
        Showing{' '}
        <span className="font-semibold text-foreground">{transactions.length}</span>
        {displayTotal > transactions.length && (
          <span className="text-muted-foreground"> of {displayTotal}</span>
        )}{' '}
        transactions
      </span>
      <span className="w-px h-4 bg-border hidden sm:block" />
      <span className="text-muted-foreground">
        Income:{' '}
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {formatINR(income)}
        </span>
      </span>
      <span className="text-muted-foreground">
        Expenses:{' '}
        <span className="font-semibold text-red-600 dark:text-red-400">
          {formatINR(expenses)}
        </span>
      </span>
      <span className="text-muted-foreground">
        Net:{' '}
        <span
          className={cn(
            'font-bold',
            isPositive
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-red-700 dark:text-red-400'
          )}
        >
          {isPositive ? '+' : ''}
          {formatINR(net)}
        </span>
      </span>
    </div>
  );
}
