"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { usePeople } from "@/lib/hooks/use-people";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { useCreateBillSplit } from "@/lib/hooks/use-bill-split";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatINR } from "@/lib/finance/money";
import Decimal from "decimal.js";
import { Users, Receipt, Split, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BillSplitterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillSplitterDialog({ open, onOpenChange }: BillSplitterDialogProps) {
  const { data: people } = usePeople();
  const { data: accounts } = useAccounts();
  const { mutateAsync: createSplit, isPending } = useCreateBillSplit();

  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [paidByAccountId, setPaidByAccountId] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [participants, setParticipants] = useState<{ personId: string; personName: string; amount: number }[]>([]);
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");

  const addParticipant = () => {
    if (!selectedPersonId) return;
    const person = people?.find(p => p.id === selectedPersonId);
    if (!person) return;

    if (participants.some(p => p.personId === selectedPersonId)) {
      toast.error("Person already added to split");
      return;
    }

    const updated = [...participants, { personId: person.id, personName: person.name, amount: 0 }];
    setParticipants(updated);
    setSelectedPersonId("");

    if (splitMode === "equal") {
      recalculateEqual(updated, totalAmount);
    }
  };

  const removeParticipant = (id: string) => {
    const updated = participants.filter(p => p.personId !== id);
    setParticipants(updated);
    if (splitMode === "equal") {
      recalculateEqual(updated, totalAmount);
    }
  };

  const recalculateEqual = (list: typeof participants, total: number) => {
    if (list.length === 0 || total <= 0) return;
    // User is 1 share, participants are rest
    const shareCount = list.length + 1;
    const perShare = new Decimal(total).dividedBy(shareCount).toDecimalPlaces(2).toNumber();
    
    setParticipants(list.map(p => ({ ...p, amount: perShare })));
  };

  const handleTotalChange = (val: number) => {
    setTotalAmount(val);
    if (splitMode === "equal") {
      recalculateEqual(participants, val);
    }
  };

  const handleCustomAmountChange = (personId: string, val: number) => {
    setParticipants(participants.map(p => p.personId === personId ? { ...p, amount: val } : p));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please enter a bill title");
      return;
    }
    if (totalAmount <= 0) {
      toast.error("Please enter a valid bill amount");
      return;
    }
    if (!paidByAccountId) {
      toast.error("Please select the account used to pay");
      return;
    }
    if (participants.length === 0) {
      toast.error("Please add at least one person to split the bill with");
      return;
    }

    try {
      await createSplit({
        title: title.trim(),
        totalAmount,
        paidByAccountId,
        date: new Date().toISOString().split("T")[0],
        participants,
      });

      onOpenChange(false);
      setTitle("");
      setTotalAmount(0);
      setParticipants([]);
    } catch (err) {
      // Handled by hook
    }
  };

  const totalParticipantShares = participants.reduce((acc, p) => acc + p.amount, 0);
  const myShare = Math.max(0, totalAmount - totalParticipantShares);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Split className="h-5 w-5" />
            </div>
            <DialogTitle>Split a Bill</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Bill Title / Purpose</Label>
            <Input
              placeholder="e.g. Dinner at Punjab Grill, Goa Trip"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Total Amount</Label>
              <CurrencyInput
                value={totalAmount}
                onChange={(val) => handleTotalChange(val || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>Paid From Account</Label>
              <Select value={paidByAccountId} onChange={(e) => setPaidByAccountId(e.target.value)} required>
                <option value="">Select Account</option>
                {accounts?.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({formatINR((acc as any).current_balance || 0)})</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Split With People</Label>
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => { setSplitMode("equal"); recalculateEqual(participants, totalAmount); }}
                  className={`px-2 py-1 rounded border ${splitMode === "equal" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  Equal
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("custom")}
                  className={`px-2 py-1 rounded border ${splitMode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <Select value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)}>
                <option value="">Select a Person...</option>
                {people?.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.relationship || 'Friend'})</option>
                ))}
              </Select>
              <Button type="button" variant="outline" onClick={addParticipant} className="shrink-0">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            {participants.length > 0 && (
              <div className="space-y-2 pt-2">
                {participants.map(p => (
                  <div key={p.personId} className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/30 text-sm">
                    <span className="font-medium truncate">{p.personName}</span>
                    <div className="flex items-center gap-2">
                      {splitMode === "custom" ? (
                        <CurrencyInput
                          value={p.amount}
                          onChange={(v) => handleCustomAmountChange(p.personId, v || 0)}
                          className="w-28 h-8 text-xs text-right"
                        />
                      ) : (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatINR(p.amount)}
                        </span>
                      )}
                      <button type="button" onClick={() => removeParticipant(p.personId)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1 mt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">My Share (Expense):</span>
                    <span className="font-bold text-foreground">{formatINR(myShare)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Owed to Me (Receivables):</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatINR(totalParticipantShares)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || participants.length === 0} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPending ? "Creating Split..." : "Create Split & Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
