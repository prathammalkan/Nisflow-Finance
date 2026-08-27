"use client";

import * as React from 'react';
import { useState } from 'react';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { AccountCard } from '@/components/accounts/account-card';
import { AccountForm } from '@/components/accounts/account-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { PlusIcon, WalletIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatINR } from '@/lib/finance/money';
import { Decimal } from 'decimal.js';
import { getAccountAuthoritativeDecimalBalance } from '@/lib/finance/balance';

export default function AccountsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const { data: accounts, isLoading, error } = useAccounts(showInactive);

  const totalBalance = React.useMemo(() => {
    if (!accounts) return new Decimal(0);
    return accounts.reduce((acc, account) => {
      // Typically only sum up active accounts for total wealth, or based on purpose
      if (account.is_active) {
        return acc.plus(new Decimal(account.current_balance ?? account.balance ?? 0));
      }
      return acc;
    }, new Decimal(0));
  }, [accounts]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Accounts" 
        description="Manage your bank accounts, wallets, and investments."
        actions={
          <Button onClick={() => setIsFormOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        }
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-inactive" 
            checked={showInactive} 
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowInactive(e.target.checked)}
          />
          <Label htmlFor="show-inactive">Show inactive accounts</Label>
        </div>
        
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total Balance</p>
          <p className="text-xl font-bold">{formatINR(totalBalance.toNumber())}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col space-y-3">
              <Skeleton className="h-[200px] w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md">
          Failed to load accounts. Please try again.
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map(account => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={WalletIcon}
          title="No accounts found"
          description={showInactive ? "You don't have any accounts yet." : "You don't have any active accounts. Try showing inactive accounts or create a new one."}
          actionLabel="Add First Account"
          onAction={() => setIsFormOpen(true)}
        />
      )}

      <AccountForm 
        open={isFormOpen} 
        onOpenChange={setIsFormOpen} 
      />
    </div>
  );
}
