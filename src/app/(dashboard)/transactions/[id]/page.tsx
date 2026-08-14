"use client";

import { useParams, useRouter } from "next/navigation";
import { useTransaction } from "@/lib/hooks/use-transactions";
import { formatINR } from "@/lib/finance/money";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash2, Link as LinkIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import Decimal from "decimal.js";
import { useDeleteTransaction } from "@/lib/hooks/use-transactions";

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, isLoading } = useTransaction(id);
  const transaction = data as any;
  const deleteTransaction = useDeleteTransaction();

  if (isLoading) {
    return <div className="p-8">Loading transaction details...</div>;
  }

  if (!transaction) {
    return <div className="p-8">Transaction not found</div>;
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await deleteTransaction.mutateAsync(id);
      router.push('/transactions');
    }
  };

  const isOut = transaction.direction === 'out';
  const formattedAmount = formatINR(new Decimal(transaction.amount));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold flex-1">Transaction Details</h1>
        <Button variant="outline" className="gap-2">
          <Edit className="h-4 w-4" /> Edit
        </Button>
        <Button variant="destructive" className="gap-2" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <div className="bg-card rounded-xl p-8 border shadow-sm flex flex-col items-center text-center space-y-4">
        <div className={cn("text-5xl font-bold tracking-tight", isOut ? "text-red-600" : "text-green-600")}>
          {isOut ? '-' : '+'}{formattedAmount}
        </div>
        <p className="text-xl text-muted-foreground">{transaction.description || 'No description provided'}</p>
        
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {transaction.account?.name || 'Unknown Account'}
          </Badge>
          <Badge variant="secondary" className="text-sm px-3 py-1 capitalize">
            {transaction.type}
          </Badge>
          <Badge variant={transaction.ownership === 'personal' ? 'default' : 'secondary'} className="text-sm px-3 py-1 capitalize">
            {transaction.ownership.replace('_', ' ')}
          </Badge>
          <Badge className="text-sm px-3 py-1 capitalize">
            {transaction.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl p-6 border shadow-sm space-y-6">
          <h2 className="font-semibold text-lg border-b pb-2">Core Details</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground text-sm">Date & Time</span>
              <span className="col-span-2 font-medium">{format(parseISO(transaction.date), 'dd MMM yyyy, hh:mm a')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground text-sm">Category</span>
              <span className="col-span-2 font-medium flex items-center gap-2">
                {transaction.category?.icon && <span>{transaction.category.icon}</span>}
                {transaction.category?.name || 'Uncategorized'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground text-sm">Counterparty</span>
              <span className="col-span-2 font-medium">{transaction.counterparty?.name || 'None'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground text-sm">Payment Method</span>
              <span className="col-span-2 font-medium">{transaction.payment_method || 'Not specified'}</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 border shadow-sm space-y-6">
          <h2 className="font-semibold text-lg border-b pb-2">Additional Information</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground text-sm">Reference</span>
              <span className="col-span-2 font-medium break-all">{transaction.reference_number || '-'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground text-sm">Reconciliation</span>
              <span className="col-span-2 font-medium capitalize">{transaction.reconciliation_status || 'unreconciled'}</span>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <span className="text-muted-foreground text-sm">Notes</span>
              <div className="bg-muted/50 p-3 rounded-md text-sm whitespace-pre-wrap min-h-[60px]">
                {transaction.notes || 'No notes added.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {transaction.linked_transaction && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-6 flex items-center gap-4">
          <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-full text-blue-600 dark:text-blue-400">
            <LinkIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-300">Linked Transaction</h3>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              This is part of a transfer. View the related {transaction.linked_transaction.direction === 'in' ? 'incoming' : 'outgoing'} transaction.
            </p>
          </div>
          <Button variant="outline" className="ml-auto" onClick={() => router.push(`/transactions/${transaction.linked_transaction.id}`)}>
            View Linked
          </Button>
        </div>
      )}
    </div>
  );
}
