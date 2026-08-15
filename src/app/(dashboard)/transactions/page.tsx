"use client";

import { useState } from 'react';
import { useTransactions } from '@/lib/hooks/use-transactions';
import { formatINR } from '@/lib/finance/money';
import { TransactionFilters } from '@/components/transactions/transaction-filters';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { TransactionRowActions } from '@/components/transactions/transaction-row-actions';
import { TransactionSummaryBar } from '@/components/transactions/transaction-summary-bar';
import { cn } from '@/lib/utils';
import Decimal from 'decimal.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function TransactionsPage() {
  const [filters, setFilters] = useState<any>({
    page: 1,
    pageSize: 20,
    sortBy: 'date',
    sortOrder: 'desc'
  });
  
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data, isLoading } = useTransactions(filters);

  const handleFilterChange = (newFilters: any) => {
    setFilters({ ...filters, ...newFilters });
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev: any) => ({ ...prev, page: newPage }));
  };

  const columns = [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }: any) => format(parseISO(row.original.date), 'dd MMM yyyy'),
    },
    {
      accessorKey: 'description',
      header: 'Description',
    },
    {
      accessorKey: 'account.name',
      header: 'Account',
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.original.account?.name || 'Unknown'}</Badge>
      )
    },
    {
      accessorKey: 'category.name',
      header: 'Category',
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2">
          {row.original.category?.icon && <span>{row.original.category.icon}</span>}
          <span>{row.original.category?.name || 'Uncategorized'}</span>
        </div>
      )
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }: any) => {
        const isOut = row.original.direction === 'out';
        return (
          <span className={cn("font-medium", isOut ? "text-red-600" : "text-green-600")}>
            {isOut ? '-' : '+'}{formatINR(new Decimal(row.original.amount))}
          </span>
        );
      }
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }: any) => <Badge>{row.original.type}</Badge>
    },
    {
      accessorKey: 'ownership',
      header: 'Ownership',
      cell: ({ row }: any) => (
        <Badge variant={row.original.ownership === 'personal' ? 'default' : 'secondary'}>
          {row.original.ownership === 'personal' ? 'Personal' : 'Third-party'}
        </Badge>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => {
        const statusMap: any = {
          draft: 'bg-slate-100 text-slate-800',
          pending: 'bg-yellow-100 text-yellow-800',
          confirmed: 'bg-green-100 text-green-800',
          reconciled: 'bg-blue-100 text-blue-800',
        };
        const sClass = statusMap[row.original.status] || 'bg-slate-100 text-slate-800';
        return (
          <span className={cn("px-2 py-1 rounded-full text-xs font-medium", sClass)}>
            {row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
          </span>
        );
      }
    },
    {
      id: 'actions',
      cell: ({ row }: any) => <TransactionRowActions transaction={row.original} />
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Transactions" 
        description="Master transaction ledger for all your accounts."
        actions={
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Transaction
          </Button>
        }
      />

      <TransactionFilters filters={filters} onChange={handleFilterChange} />

      <TransactionSummaryBar transactions={data?.data || []} totalCount={data?.total} />

      {/* Mobile: Card view */}
      <div className="md:hidden space-y-3">
        {(data?.data || []).map((tx: any) => (
          <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl border bg-card">
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-sm font-medium truncate">{tx.description || 'Unnamed Transaction'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tx.account?.name || 'Unknown'} · {format(parseISO(tx.date), 'dd MMM yyyy')}
              </p>
              {tx.category?.name && (
                <p className="text-xs text-muted-foreground">{tx.category.name}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className={cn("text-sm font-semibold", tx.direction === 'out' ? 'text-red-500' : 'text-emerald-500')}>
                {tx.direction === 'out' ? '-' : '+'}{formatINR(new Decimal(tx.amount))}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">{tx.type}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
          </div>
        )}
        {(!data?.data || data.data.length === 0) && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">No transactions found</div>
        )}
      </div>

      {/* Desktop: Table view */}
      <div className="hidden md:block overflow-x-auto">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 w-full rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <DataTable 
            columns={columns} 
            data={data?.data || []} 
          />
        )}
      </div>

      {((data?.total ?? 0) > (filters.pageSize || 20)) && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            Showing {data?.data?.length || 0} of {data?.total} transactions
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(filters.page - 1)}
              disabled={filters.page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {filters.page} of {Math.ceil((data?.total || 0) / (filters.pageSize || 20))}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(filters.page + 1)}
              disabled={filters.page >= Math.ceil((data?.total || 0) / (filters.pageSize || 20))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <TransactionForm 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
      />
    </div>
  );
}
