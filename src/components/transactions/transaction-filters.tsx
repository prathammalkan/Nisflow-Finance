'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { useCategories } from '@/lib/hooks/use-categories';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'reconciled', label: 'Reconciled' },
];

const OWNERSHIP_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'third_party', label: 'Third Party' },
];

interface TransactionFiltersProps {
  filters: any;
  onChange: (f: any) => void;
}

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: accountsData } = useAccounts();
  const { data: categoriesData } = useCategories();

  const accounts = (accountsData as any[] | undefined) || [];
  const categories = (categoriesData as any[] | undefined) || [];

  const activeType = filters.transaction_type?.[0] || 'all';
  const activeStatus = filters.status?.[0] || 'all';
  const activeOwnership = filters.ownership || 'all';

  // Count advanced filters active
  const advancedCount = [
    filters.account_id,
    filters.category_id,
    filters.status?.[0],
    filters.ownership,
    filters.min_amount,
    filters.max_amount,
  ].filter(Boolean).length;

  const setType = (v: string) =>
    onChange({ transaction_type: v === 'all' ? undefined : [v], page: 1 });
  const setStatus = (v: string) =>
    onChange({ status: v === 'all' ? undefined : [v], page: 1 });
  const setOwnership = (v: string) =>
    onChange({ ownership: v === 'all' ? undefined : v, page: 1 });

  const clearAll = () =>
    onChange({
      search: undefined,
      transaction_type: undefined,
      date_from: undefined,
      date_to: undefined,
      account_id: undefined,
      category_id: undefined,
      status: undefined,
      ownership: undefined,
      min_amount: undefined,
      max_amount: undefined,
      page: 1,
    });

  const hasAnyFilter = [
    filters.search,
    filters.transaction_type,
    filters.date_from,
    filters.date_to,
    filters.account_id,
    filters.category_id,
    filters.status,
    filters.ownership,
    filters.min_amount,
    filters.max_amount,
  ].some(Boolean);

  // Active chips
  const chips = [
    filters.search && {
      key: 'search',
      label: `Search: "${filters.search}"`,
      clear: () => onChange({ search: undefined, page: 1 }),
    },
    filters.transaction_type?.[0] && {
      key: 'type',
      label: `Type: ${filters.transaction_type[0]}`,
      clear: () => onChange({ transaction_type: undefined, page: 1 }),
    },
    filters.date_from && {
      key: 'from',
      label: `From: ${filters.date_from}`,
      clear: () => onChange({ date_from: undefined, page: 1 }),
    },
    filters.date_to && {
      key: 'to',
      label: `To: ${filters.date_to}`,
      clear: () => onChange({ date_to: undefined, page: 1 }),
    },
    filters.account_id && {
      key: 'account',
      label: `Account: ${accounts.find((a: any) => a.id === filters.account_id)?.name || 'filtered'}`,
      clear: () => onChange({ account_id: undefined, page: 1 }),
    },
    filters.category_id && {
      key: 'category',
      label: `Category: ${categories.find((c: any) => c.id === filters.category_id)?.name || 'filtered'}`,
      clear: () => onChange({ category_id: undefined, page: 1 }),
    },
    filters.status?.[0] && {
      key: 'status',
      label: `Status: ${filters.status[0]}`,
      clear: () => onChange({ status: undefined, page: 1 }),
    },
    filters.ownership && {
      key: 'ownership',
      label: `Ownership: ${filters.ownership.replace('_', ' ')}`,
      clear: () => onChange({ ownership: undefined, page: 1 }),
    },
    filters.min_amount && {
      key: 'min',
      label: `Min: ₹${filters.min_amount}`,
      clear: () => onChange({ min_amount: undefined, page: 1 }),
    },
    filters.max_amount && {
      key: 'max',
      label: `Max: ₹${filters.max_amount}`,
      clear: () => onChange({ max_amount: undefined, page: 1 }),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <div className="space-y-3 mb-6">
      {/* Main bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by description or notes…"
            className="pl-9"
            value={filters.search || ''}
            onChange={(e) => onChange({ search: e.target.value || undefined, page: 1 })}
          />
        </div>

        {/* Type pill buttons */}
        <div className="flex gap-1 flex-wrap">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setType(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                activeType === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="date"
            className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            value={filters.date_from || ''}
            onChange={(e) => onChange({ date_from: e.target.value || undefined, page: 1 })}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
            value={filters.date_to || ''}
            onChange={(e) => onChange({ date_to: e.target.value || undefined, page: 1 })}
          />
        </div>

        {/* More Filters toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
            expanded
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-background text-foreground border-border hover:bg-muted'
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More Filters
          {advancedCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-bold">
              {advancedCount}
            </span>
          )}
        </button>

        {/* Clear All */}
        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-destructive border border-destructive/20 hover:bg-destructive/5 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear All
          </button>
        )}
      </div>

      {/* Advanced filters (expandable) */}
      {expanded && (
        <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Account */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Account</label>
            <select
              className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
              value={filters.account_id || ''}
              onChange={(e) => onChange({ account_id: e.target.value || undefined, page: 1 })}
            >
              <option value="">All Accounts</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
            <select
              className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
              value={filters.category_id || ''}
              onChange={(e) => onChange({ category_id: e.target.value || undefined, page: 1 })}
            >
              <option value="">All Categories</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status pills */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors capitalize',
                    activeStatus === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ownership pills */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Ownership</label>
            <div className="flex flex-wrap gap-1">
              {OWNERSHIP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setOwnership(opt.value)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors',
                    activeOwnership === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount range */}
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Amount Range (₹)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Min"
                className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                value={filters.min_amount || ''}
                onChange={(e) =>
                  onChange({ min_amount: e.target.value ? Number(e.target.value) : undefined, page: 1 })
                }
              />
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Max"
                className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
                value={filters.max_amount || ''}
                onChange={(e) =>
                  onChange({ max_amount: e.target.value ? Number(e.target.value) : undefined, page: 1 })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full"
            >
              {chip.label}
              <button onClick={chip.clear} className="hover:text-primary/70 ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
