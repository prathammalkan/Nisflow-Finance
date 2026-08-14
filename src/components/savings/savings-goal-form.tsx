"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCreateSavingsGoal, useUpdateSavingsGoal, useDeleteSavingsGoal } from "@/lib/hooks/use-savings-goals";

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
    deadline: "",
    monthly_contribution: "",
    status: "active",
    color: "#3b82f6"
  });

  const createMutation = useCreateSavingsGoal();
  const updateMutation = useUpdateSavingsGoal();
  const deleteMutation = useDeleteSavingsGoal();

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        target_amount: initialData.target_amount?.toString() || "",
        current_amount: initialData.current_amount?.toString() || "0",
        deadline: initialData.deadline ? initialData.deadline.split("T")[0] : "",
        monthly_contribution: initialData.monthly_contribution?.toString() || "",
        status: initialData.status || "active",
        color: initialData.color || "#3b82f6"
      });
    } else {
      setFormData({
        name: "",
        target_amount: "",
        current_amount: "0",
        deadline: "",
        monthly_contribution: "",
        status: "active",
        color: "#3b82f6"
      });
    }
  }, [initialData, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      target_amount: Number(formData.target_amount) || 0,
      current_amount: Number(formData.current_amount) || 0,
      monthly_contribution: formData.monthly_contribution ? Number(formData.monthly_contribution) : null,
      deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null
    };

    if (initialData?.id) {
      updateMutation.mutate({ id: initialData.id, ...payload }, {
        onSuccess: () => onClose()
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => onClose()
      });
    }
  };

  const handleDelete = () => {
    if (initialData?.id && confirm("Are you sure you want to delete this goal?")) {
      deleteMutation.mutate(initialData.id, {
        onSuccess: () => onClose()
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initialData ? "Edit Savings Goal" : "New Savings Goal"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Goal Name</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g. New Car"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="target_amount">Target Amount (₹)</Label>
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
                <Label htmlFor="current_amount">Current Amount (₹)</Label>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="deadline">Target Date</Label>
                <Input
                  id="deadline"
                  name="deadline"
                  type="date"
                  value={formData.deadline}
                  onChange={handleChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="monthly_contribution">Monthly Contrib. (₹)</Label>
                <Input
                  id="monthly_contribution"
                  name="monthly_contribution"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.monthly_contribution}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <div className="relative">
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="color">Theme Color</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="color"
                    name="color"
                    type="color"
                    value={formData.color}
                    onChange={handleChange}
                    className="h-10 w-full p-1 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between items-center">
            {initialData && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleteMutation.isPending || isPending}
              >
                Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Goal"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
