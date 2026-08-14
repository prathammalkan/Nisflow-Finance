'use client';

import { useState } from 'react';
import { usePerson } from '@/lib/hooks/use-people';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReceivableForm } from '@/components/people/receivable-form';
import { PayableForm } from '@/components/people/payable-form';
import { LoanCalculatorDialog } from '@/components/finance/loan-calculator-dialog';
import { generatePrintablePDFStatement } from '@/lib/export-statement';
import { openWhatsAppReminder, openSMSReminder } from '@/lib/utils/reminder';
import { Printer, Send, Calculator, FileText } from 'lucide-react';

export default function PersonDetailPage() {
  const params = useParams();
  const { data: person, isLoading } = usePerson(params.id as string);
  const [loanCalcOpen, setLoanCalcOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading person detail...</div>;
  if (!person) return <div className="p-8 text-center text-muted-foreground">Person not found</div>;

  const amountOwedBy = new Decimal(person.amount_owed_by || 0);
  const amountOwedTo = new Decimal(person.amount_owed_to || 0);
  const thirdPartyHeld = new Decimal(person.third_party_held || 0);
  
  const netOwed = amountOwedBy.minus(amountOwedTo);

  const handlePrintPDFStatement = () => {
    generatePrintablePDFStatement({
      title: `Person Ledger Statement: ${person.name}`,
      subtitle: `Relationship: ${person.relationship || 'Counterparty'} | Contact: ${person.phone || person.email || 'N/A'}`,
      entityName: person.name,
      entityType: 'Person',
      rows: [
        {
          date: new Date().toISOString().split('T')[0],
          description: 'Amount Owed By Them (Receivable)',
          type: 'Receivable',
          inflow: amountOwedBy.toNumber(),
          balance: amountOwedBy.toNumber(),
        },
        {
          date: new Date().toISOString().split('T')[0],
          description: 'Amount Owed To Them (Payable)',
          type: 'Payable',
          outflow: amountOwedTo.toNumber(),
          balance: netOwed.toNumber(),
        },
      ],
      totalIn: amountOwedBy.toNumber(),
      totalOut: amountOwedTo.toNumber(),
      closingBalance: netOwed.toNumber(),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{person.name}</h1>
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Badge variant="outline">{person.relationship || 'Other'}</Badge>
            {person.email && <span>• {person.email}</span>}
            {person.phone && <span>• {person.phone}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={handlePrintPDFStatement}>
            <Printer className="h-4 w-4" /> Print PDF Statement
          </Button>

          {amountOwedBy.gt(0) && (
            <Button
              variant="outline"
              className="gap-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              onClick={() => openWhatsAppReminder({
                personName: person.name,
                phone: person.phone,
                amount: amountOwedBy.toNumber(),
                reason: 'Outstanding Balance',
              })}
            >
              <Send className="h-4 w-4" /> WhatsApp Reminder
            </Button>
          )}

          <Button variant="outline" className="gap-2" onClick={() => setLoanCalcOpen(true)}>
            <Calculator className="h-4 w-4" /> Loan Calculator
          </Button>

          <ReceivableForm />
          <PayableForm />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 border rounded-xl bg-card">
          <div className="text-xs font-semibold text-muted-foreground uppercase">Total Received</div>
          <div className="text-xl font-bold mt-1">{formatINR(person.total_received || 0)}</div>
        </div>
        <div className="p-4 border rounded-xl bg-card">
          <div className="text-xs font-semibold text-muted-foreground uppercase">Total Given</div>
          <div className="text-xl font-bold mt-1">{formatINR(person.total_given || 0)}</div>
        </div>
        <div className="p-4 border rounded-xl bg-emerald-500/10 border-emerald-500/20">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Owed By Them</div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{formatINR(amountOwedBy.toNumber())}</div>
        </div>
        <div className="p-4 border rounded-xl bg-red-500/10 border-red-500/20">
          <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Owed To Them</div>
          <div className="text-xl font-bold text-red-700 dark:text-red-300 mt-1">{formatINR(amountOwedTo.toNumber())}</div>
        </div>
        <div className="p-4 border rounded-xl bg-amber-500/10 border-amber-500/20">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">3rd Party Held</div>
          <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">{formatINR(thirdPartyHeld.toNumber())}</div>
        </div>
      </div>

      <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/40 flex justify-between items-center">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Statement Summary
          </h2>
          <div className="font-medium text-sm">
            Status: {netOwed.eq(0) ? 'SETTLED' : netOwed.gt(0) ? `${formatINR(netOwed.toNumber())} Outstanding` : `You Owe ${formatINR(netOwed.abs().toNumber())}`}
          </div>
        </div>
        <div className="p-8 text-center text-muted-foreground text-sm">
          Complete ledger statement active. Click <strong>Print PDF Statement</strong> above to download the formatted PDF.
        </div>
      </div>

      <LoanCalculatorDialog open={loanCalcOpen} onOpenChange={setLoanCalcOpen} />
    </div>
  );
}
