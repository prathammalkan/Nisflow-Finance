'use client';

import { useState } from 'react';
import { usePeople } from '@/lib/hooks/use-people';
import { PersonCard } from '@/components/people/person-card';
import { PersonForm } from '@/components/people/person-form';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">People & Counterparties</h2>
        <PersonForm />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Total Receivable</div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{formatINR(totals.receivable.toNumber())}</div>
        </div>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="text-sm text-red-600 dark:text-red-400 font-medium">Total Payable</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">{formatINR(totals.payable.toNumber())}</div>
        </div>
        <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="text-sm text-primary font-medium">Net Position</div>
          <div className="text-2xl font-bold text-primary">{formatINR(netPosition.toNumber())}</div>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Input 
          placeholder="Search people..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filteredPeople.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <h3 className="text-lg font-medium text-muted-foreground">No people found</h3>
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
