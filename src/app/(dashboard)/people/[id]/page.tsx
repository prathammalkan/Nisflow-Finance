'use client';

import { usePerson } from '@/lib/hooks/use-people';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ReceivableForm } from '@/components/people/receivable-form';
import { PayableForm } from '@/components/people/payable-form';

export default function PersonDetailPage() {
  const params = useParams();
  const { data: person, isLoading } = usePerson(params.id as string);

  if (isLoading) return <div>Loading...</div>;
  if (!person) return <div>Person not found</div>;

  const amountOwedBy = new Decimal(person.amount_owed_by || 0);
  const amountOwedTo = new Decimal(person.amount_owed_to || 0);
  const thirdPartyHeld = new Decimal(person.third_party_held || 0);
  
  const netOwed = amountOwedBy.minus(amountOwedTo);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{person.name}</h1>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
            <Badge variant="outline">{person.relationship || 'Other'}</Badge>
            {person.email && <span>• {person.email}</span>}
            {person.phone && <span>• {person.phone}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <ReceivableForm />
          <PayableForm />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="text-sm font-medium text-muted-foreground">Total Received</div>
          <div className="text-xl font-bold">{formatINR(person.total_received || 0)}</div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="text-sm font-medium text-muted-foreground">Total Given</div>
          <div className="text-xl font-bold">{formatINR(person.total_given || 0)}</div>
        </div>
        <div className="p-4 border rounded-lg bg-green-50">
          <div className="text-sm font-medium text-green-600">Owed By Them</div>
          <div className="text-xl font-bold text-green-700">{formatINR(amountOwedBy.toNumber())}</div>
        </div>
        <div className="p-4 border rounded-lg bg-red-50">
          <div className="text-sm font-medium text-red-600">Owed To Them</div>
          <div className="text-xl font-bold text-red-700">{formatINR(amountOwedTo.toNumber())}</div>
        </div>
        <div className="p-4 border rounded-lg bg-amber-50">
          <div className="text-sm font-medium text-amber-600">3rd Party Held</div>
          <div className="text-xl font-bold text-amber-700">{formatINR(thirdPartyHeld.toNumber())}</div>
        </div>
      </div>

      <div className="border rounded-lg mt-8">
        <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
          <h2 className="font-semibold text-lg">Transaction Statement</h2>
          <div className="font-medium">
            Status: {netOwed.eq(0) ? 'SETTLED' : netOwed.gt(0) ? `${formatINR(netOwed.toNumber())} Outstanding` : `You Owe ${formatINR(netOwed.abs().toNumber())}`}
          </div>
        </div>
        <div className="p-6 text-center text-muted-foreground">
          Transaction history will appear here.
        </div>
      </div>
    </div>
  );
}
