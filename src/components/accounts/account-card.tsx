"use client";

import * as React from 'react';
import Link from 'next/link';
import { formatINR } from '@/lib/finance/money';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDownIcon, ArrowUpIcon, Building2Icon, CreditCardIcon, LandmarkIcon, WalletIcon } from 'lucide-react';
import { useAccountStats } from '@/lib/hooks/use-accounts';
import { getAccountAuthoritativeBalance } from '@/lib/finance/balance';
import type { Database } from '@/types/database';

type Account = Database['public']['Tables']['accounts']['Row'];

interface AccountCardProps {
  account: Account;
  className?: string;
}

export function AccountCard({ account, className }: AccountCardProps) {
  const { data: stats } = useAccountStats(account.id);
  const acct = account as any;
  const balance = getAccountAuthoritativeBalance(account);

  const getIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'bank account':
      case 'fixed deposit':
        return <LandmarkIcon className="h-5 w-5" />;
      case 'credit card':
      case 'debit card':
        return <CreditCardIcon className="h-5 w-5" />;
      case 'cash':
      case 'upi wallet':
        return <WalletIcon className="h-5 w-5" />;
      default:
        return <Building2Icon className="h-5 w-5" />;
    }
  };

  return (
    <Link href={`/accounts/${account.id}`} className={cn("block transition-all hover:scale-[1.02]", className)}>
      <Card className={cn(
        "h-full overflow-hidden border-l-4",
        !acct.is_active && "opacity-70 grayscale",
        "border-l-primary"
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary"
              >
                {getIcon(acct.type || '')}
              </div>
              <div>
                <h3 className="font-semibold">{account.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{acct.type}</span>
                  {(acct.institution || acct.purpose) && (
                    <>
                      <span>•</span>
                      <span>{acct.institution || acct.purpose}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {acct.purpose || 'General'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pb-3">
          <div className="mt-2">
            <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
            <p className={cn(
              "text-2xl font-bold tracking-tight",
              balance < 0 ? "text-destructive" : "text-foreground"
            )}>
              {formatINR(balance)}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-1">
              <div className="rounded-full bg-emerald-500/10 p-0.5">
                <ArrowDownIcon className="h-3 w-3 text-emerald-500" />
              </div>
              <span className="text-muted-foreground">In</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {stats ? formatINR(stats.inflow) : '...'}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="rounded-full bg-red-500/10 p-0.5">
                <ArrowUpIcon className="h-3 w-3 text-red-500" />
              </div>
              <span className="text-muted-foreground">Out</span>
              <span className="font-medium text-red-600 dark:text-red-400">
                {stats ? formatINR(stats.outflow) : '...'}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="bg-muted/30 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-between w-full">
            <span>Last reconciled</span>
            <span className="font-medium">Never</span>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
}
