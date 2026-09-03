"use client";

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useAccountStats, useDeleteAccount } from '@/lib/hooks/use-accounts';
import { useTransactions } from '@/lib/hooks/use-transactions';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/finance/money';
import { ArrowLeftIcon, PencilIcon, TrashIcon, ArrowRightLeft, Loader2 } from 'lucide-react';
import { AccountForm } from '@/components/accounts/account-form';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { generatePrintablePDFStatement } from '@/lib/export-statement';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Decimal } from 'decimal.js';
import { getAccountAuthoritativeBalance } from '@/lib/finance/balance';

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const { data, isLoading, error } = useAccount(id);
  const account = data as any;
  const { data: stats } = useAccountStats(id);
  const deleteAccount = useDeleteAccount();
  
  const { data: txResult, isLoading: isTxLoading } = useTransactions({
    account_id: id,
    pageSize: 50,
  });

  const [isEditFormOpen, setIsEditFormOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-[200px] w-full" /></div>;
  }

  if (error || !account) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-md">Failed to load account.</div>;
  }

  const handleDelete = async () => {
    await deleteAccount.mutateAsync(account.id);
    setIsDeleteDialogOpen(false);
    router.push('/accounts');
  };

  const transactions = txResult?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/accounts')}>
          <ArrowLeftIcon className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {account.name}
              {!account.is_active && <Badge variant="destructive">Inactive</Badge>}
            </h1>
            <div className="flex items-center space-x-3 mt-2 text-muted-foreground">
              {account.institution && <span>{account.institution}</span>}
              {account.institution && <span>•</span>}
              <Badge variant="outline">{account.type}</Badge>
              {account.purpose && (
                <>
                  <span>•</span>
                  <Badge variant="secondary">{account.purpose}</Badge>
                </>
              )}
            </div>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => {
              const authBal = getAccountAuthoritativeBalance(account);
              generatePrintablePDFStatement({
                title: `Account Statement: ${account.name}`,
                subtitle: `Institution: ${account.institution || 'N/A'} | Type: ${account.type || 'Account'}`,
                entityName: account.name,
                entityType: 'Account',
                rows: [
                  {
                    date: new Date().toISOString().split('T')[0],
                    description: 'Current Account Balance',
                    type: 'Balance',
                    inflow: authBal > 0 ? authBal : 0,
                    outflow: authBal < 0 ? Math.abs(authBal) : 0,
                    balance: authBal,
                  }
                ],
                totalIn: stats ? stats.inflow : 0,
                totalOut: stats ? stats.outflow : 0,
                closingBalance: authBal,
              });
            }}>
              Print PDF Statement
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditFormOpen(true)}>
              <PencilIcon className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {account.is_active && (
              <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
                <TrashIcon className="mr-2 h-4 w-4" />
                Deactivate
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold", getAccountAuthoritativeBalance(account) < 0 ? "text-destructive" : "")}>
              {formatINR(getAccountAuthoritativeBalance(account))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Personal Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatINR(Number(account.personal_balance))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Third-party: {formatINR(Number(account.third_party_balance))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Inflow</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {stats ? formatINR(stats.inflow) : '...'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outflow</p>
                <p className="text-lg font-semibold text-red-600">
                  {stats ? formatINR(stats.outflow) : '...'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
          <div>
            <CardTitle className="text-lg font-bold">Transaction History</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing last 50 transactions for this account.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/transactions?account_id=${id}`}>
              View All in Transactions
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isTxLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading transaction history...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground">
              <ArrowRightLeft className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No transactions found</p>
              <p className="text-xs">No ledger records have been logged for this account yet.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {format(parseISO(tx.date), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/transactions/${tx.id}`} className="hover:text-primary transition-colors">
                            {tx.description || 'Unnamed Transaction'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {tx.category?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                          {tx.type}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {tx.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                          <span className={tx.direction === 'out' ? 'text-red-500' : 'text-emerald-500'}>
                            {tx.direction === 'out' ? '-' : '+'}{formatINR(new Decimal(tx.amount))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-border">
                {transactions.map((tx: any) => (
                  <Link
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium truncate">{tx.description || 'Unnamed Transaction'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(tx.date), 'dd MMM yyyy')} · {tx.category?.name || tx.type}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-sm font-semibold", tx.direction === 'out' ? 'text-red-500' : 'text-emerald-500')}>
                        {tx.direction === 'out' ? '-' : '+'}{formatINR(new Decimal(tx.amount))}
                      </p>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                        {tx.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AccountForm 
        open={isEditFormOpen} 
        onOpenChange={setIsEditFormOpen}
        account={account}
      />

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Deactivate Account"
        description={`Are you sure you want to deactivate "${account.name}"? Inactive accounts will be hidden from default balance summaries but their historical ledger entries will be preserved.`}
        confirmLabel="Deactivate Account"
        onConfirm={handleDelete}
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
