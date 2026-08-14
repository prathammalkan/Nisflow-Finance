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
import { cn } from '@/lib/utils';
import Decimal from 'decimal.js';

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
    setFilters({ ...filters, ...newFilters, page: 1 });
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

      <DataTable 
        columns={columns} 
        data={data?.data || []} 
      />

      <TransactionForm 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
      />
    </div>
  );
}
