"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useAccountStats, useDeleteAccount } from '@/lib/hooks/use-accounts';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/finance/money';
import { ArrowLeftIcon, PencilIcon, TrashIcon, AlertCircleIcon } from 'lucide-react';
import { AccountForm } from '@/components/accounts/account-form';
import { generatePrintablePDFStatement } from '@/lib/export-statement';
import { cn } from '@/lib/utils';
// Placeholder for transactions - in a real app use hooks
import { Decimal } from 'decimal.js';

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const { data, isLoading, error } = useAccount(id);
  const account = data as any;
  const { data: stats } = useAccountStats(id);
  const deleteAccount = useDeleteAccount();
  
  const [isEditFormOpen, setIsEditFormOpen] = React.useState(false);

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-[200px] w-full" /></div>;
  }

  if (error || !account) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-md">Failed to load account.</div>;
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to deactivate this account?')) {
      await deleteAccount.mutateAsync(account.id);
      router.push('/accounts');
    }
  };

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
              <span>{account.institution}</span>
              <span>•</span>
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
                    inflow: Number(account.current_balance) > 0 ? Number(account.current_balance) : 0,
                    outflow: Number(account.current_balance) < 0 ? Math.abs(Number(account.current_balance)) : 0,
                    balance: Number(account.current_balance),
                  }
                ],
                totalIn: stats ? stats.inflow : 0,
                totalOut: stats ? stats.outflow : 0,
                closingBalance: Number(account.current_balance),
              });
            }}>
              Print PDF Statement
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditFormOpen(true)}>
              <PencilIcon className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {account.is_active && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
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
            <div className={cn("text-3xl font-bold", Number(account.current_balance) < 0 ? "text-destructive" : "")}>
              {formatINR(Number(account.current_balance))}
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

      <div className="rounded-md border p-8 flex flex-col items-center justify-center text-center space-y-3 bg-muted/20">
        <AlertCircleIcon className="h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-medium">Transaction History</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Transactions component will be integrated here. It will show the last 50 transactions for this account with filters for date range, category, and type.
        </p>
      </div>

      <AccountForm 
        open={isEditFormOpen} 
        onOpenChange={setIsEditFormOpen}
        account={account}
      />
    </div>
  );
}
