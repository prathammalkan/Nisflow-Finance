'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatINR } from '@/lib/finance/money';
import { usePersonLedger } from '@/lib/hooks/use-people';
import Decimal from 'decimal.js';
import Link from 'next/link';
import type { CounterpartyBalances } from '@/lib/ledger/people';

interface PersonCardProps {
  person: any;
  ledgerBalance?: CounterpartyBalances;
}

export function PersonCard({ person, ledgerBalance }: PersonCardProps) {
  // If ledgerBalance is provided by parent (e.g. usePeopleLedgerSummary), use it directly;
  // otherwise fetch individual ledger balance via usePersonLedger
  const { data: ledgerData } = usePersonLedger(ledgerBalance ? '' : person.id);
  const activeBalance = ledgerBalance || ledgerData?.balances;

  const recBalance = new Decimal(activeBalance?.receivableBalance ?? 0);
  const payBalance = new Decimal(activeBalance?.payableBalance ?? 0);
  const netOwed = recBalance.minus(payBalance);

  return (
    <Link href={`/people/${person.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg">{person.name}</CardTitle>
            <Badge variant="outline">{person.relationship || 'Other'}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {netOwed.gt(0) && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Owes you</span>
                <span>{formatINR(netOwed.toNumber())}</span>
              </div>
            )}
            {netOwed.lt(0) && (
              <div className="flex justify-between text-red-600 font-medium">
                <span>You owe</span>
                <span>{formatINR(netOwed.abs().toNumber())}</span>
              </div>
            )}
            {netOwed.eq(0) && (
              <div className="flex justify-between text-muted-foreground">
                <span>Settled</span>
                <span>{formatINR(0)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
