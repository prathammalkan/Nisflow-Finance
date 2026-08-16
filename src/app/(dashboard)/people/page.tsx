'use client';

import { useState } from 'react';
import { usePeople } from '@/lib/hooks/use-people';
import { PersonCard } from '@/components/people/person-card';
import { PersonForm } from '@/components/people/person-form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { Users, Search, UserPlus } from 'lucide-react';

export default function PeoplePage() {
  const { data: people, isLoading } = usePeople();
  const [search, setSearch] = useState('');

  const filteredPeople = people?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const totals = (people || []).reduce(
    (acc, person) => {
      acc.receivable = acc.receivable.plus(person.amount_owed_by || 0);
      acc.payable = acc.payable.plus(person.amount_owed_to || 0);
      return acc;
    },
    { receivable: new Decimal(0), payable: new Decimal(0) }
  );

  const netPosition = totals.receivable.minus(totals.payable);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & Counterparties"
        description="Track money owed to you and by you across all contacts."
        actions={
          <PersonForm trigger={
            <Button><UserPlus className="mr-2 h-4 w-4" /> Add Person</Button>
          } />
        }
      />

      {/* Summary cards */}
      {!isLoading && (people?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Total Receivable</div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatINR(totals.receivable.toNumber())}</div>
          </div>
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">Total Payable</div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{formatINR(totals.payable.toNumber())}</div>
          </div>
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Net Position</div>
            <div className={`text-2xl font-bold ${netPosition.gte(0) ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
              {formatINR(netPosition.toNumber())}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {!isLoading && (people?.length ?? 0) > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filteredPeople.length === 0 && search ? (
        <div className="text-center py-12 border rounded-xl bg-muted/10 text-muted-foreground text-sm">
          No people found matching &ldquo;{search}&rdquo;
        </div>
      ) : (people?.length ?? 0) === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in-50">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No counterparties yet</h3>
          <p className="mt-2 mb-4 text-sm text-muted-foreground max-w-sm mx-auto">
            Add people you owe money to or who owe you money. Track receivables, payables and bill splits.
          </p>
          <PersonForm trigger={
            <Button><UserPlus className="mr-2 h-4 w-4" /> Add First Person</Button>
          } />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPeople.map(person => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      )}
    </div>
  );
}

