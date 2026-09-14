"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateSavingsGoal, useUpdateSavingsGoal, useDeleteSavingsGoal } from "@/lib/hooks/use-savings-goals";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SavingsGoalFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
}

export function SavingsGoalForm({ isOpen, onClose, initialData }: SavingsGoalFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    target_amount: "",
    current_amount: "0",
    target_date: "",
    status: "active",
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const createMutation = useCreateSavingsGoal();
  const updateMutation = useUpdateSavingsGoal();
  const deleteMutation = useDeleteSavingsGoal();

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        target_amount: initialData.target_amount?.toString() || "",
        current_amount: initialData.current_amount?.toString() || "0",
        // DB column is target_date (timestamptz) — extract date part for the input
        target_date: initialData.target_date
          ? String(initialData.target_date).split("T")[0]
          : "",
        status: initialData.status || "active",
      });
    } else {
      setFormData({
        name: "",
        target_amount: "",
        current_amount: "0",
        target_date: "",
        status: "active",
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: formData.name,
      target_amount: parseFloat(formData.target_amount) || 0,
      current_amount: parseFloat(formData.current_amount) || 0,
      // Send as ISO string if provided, else null
      target_date: formData.target_date ? new Date(formData.target_date).toISOString() : null,
      status: formData.status,
    };

    if (initialData?.id) {
      updateMutation.mutate({ id: initialData.id, ...payload }, {
        onSuccess: () => onClose(),
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onClose(),
      });
    }
  };

  const handleDelete = () => {
    if (initialData?.id) {
      deleteMutation.mutate(initialData.id, {
        onSuccess: () => {
          setIsDeleteDialogOpen(false);
          onClose();
        },
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Progress percentage for display when editing
  const progress = initialData
    ? Math.min(
        100,
        Math.max(
          0,
          (parseFloat(formData.current_amount) /
            Math.max(1, parseFloat(formData.target_amount))) *
            100
        )
      )
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {initialData ? "Edit Savings Goal" : "New Savings Goal"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Goal name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Goal Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g. Emergency Fund"
              />
            </div>

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="target_amount">Target (₹)</Label>
                <Input
                  id="target_amount"
                  name="target_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.target_amount}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="current_amount">Saved so far (₹)</Label>
                <Input
                  id="current_amount"
                  name="current_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.current_amount}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            {/* Progress bar when editing */}
            {initialData && parseFloat(formData.target_amount) > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {Math.round(progress)}% of target
                </p>
              </div>
            )}

            {/* Target date + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="target_date">Target Date</Label>
                <Input
                  id="target_date"
                  name="target_date"
                  type="date"
                  value={formData.target_date}
                  onChange={handleChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between items-center">
            {initialData && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={deleteMutation.isPending || isPending}
              >
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save Goal"}
              </Button>
            </div>
          </DialogFooter>
        </form>

        <ConfirmDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          title="Delete Savings Goal"
          description={`Are you sure you want to delete "${formData.name || "this goal"}"? This cannot be undone.`}
          confirmLabel="Delete Goal"
          onConfirm={handleDelete}
          isLoading={deleteMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
