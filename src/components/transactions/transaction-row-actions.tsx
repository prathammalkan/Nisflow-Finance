"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuTrigger, DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Edit, Trash2 } from "lucide-react";
import { useDeleteTransaction } from "@/lib/hooks/use-transactions";
import { useRouter } from "next/navigation";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Database } from "@/types/database";

type TransactionRow = Database['public']['Tables']['transactions']['Row'];

export function TransactionRowActions({ transaction }: { transaction: TransactionRow | any }) {
  const deleteTransaction = useDeleteTransaction();
  const router = useRouter();

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const handleDelete = async () => {
    await deleteTransaction.mutateAsync(transaction.id);
    setIsDeleteDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open transaction actions menu">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/transactions/${transaction.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600 focus:bg-red-50 focus:text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TransactionForm
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        transaction={transaction}
      />

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Transaction"
        description="Are you sure you want to delete this transaction? This will reverse any linked accounting journal lines and adjust account balances."
        confirmLabel="Delete Transaction"
        onConfirm={handleDelete}
        isLoading={deleteTransaction.isPending}
      />
    </>
  );
}
