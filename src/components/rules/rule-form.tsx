"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateRule, useUpdateRule } from "@/lib/hooks/use-rules";
import { PlusCircle, Trash2 } from "lucide-react";

interface RuleFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
}

export function RuleForm({ isOpen, onClose, initialData }: RuleFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    priority: "0",
    is_active: true,
  });

  const [conditions, setConditions] = useState<any[]>([
    { field: "description", operator: "contains", value: "" }
  ]);

  const [actions, setActions] = useState({
    suggest_category: "",
    suggest_type: "expense",
    suggest_ownership: "personal"
  });

  const createMutation = useCreateRule();
  const updateMutation = useUpdateRule();

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        priority: initialData.priority?.toString() || "0",
        is_active: initialData.is_active ?? true,
      });
      setConditions(initialData.conditions || [{ field: "description", operator: "contains", value: "" }]);
      setActions(initialData.actions || { suggest_category: "", suggest_type: "expense", suggest_ownership: "personal" });
    } else {
      setFormData({ name: "", priority: "0", is_active: true });
      setConditions([{ field: "description", operator: "contains", value: "" }]);
      setActions({ suggest_category: "", suggest_type: "expense", suggest_ownership: "personal" });
    }
  }, [initialData, isOpen]);

  const handleAddCondition = () => {
    setConditions([...conditions, { field: "description", operator: "contains", value: "" }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (index: number, field: string, value: string) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out incomplete conditions
    const validConditions = conditions.filter(c => c.field && c.operator && c.value.trim() !== "");
    
    if (validConditions.length === 0) {
      alert("Please add at least one valid condition.");
      return;
    }

    const payload = {
      ...formData,
      priority: Number(formData.priority) || 0,
      conditions: validConditions,
      actions
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

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <DialogHeader>
            <DialogTitle>{initialData ? "Edit Rule" : "Create Rule"}</DialogTitle>
          </DialogHeader>
          
          <div className="overflow-y-auto py-4 space-y-6 flex-1 px-1">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Rule Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  placeholder="e.g. Salary Income"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority (Higher runs first)</Label>
                  <Input
                    id="priority"
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="is_active" className="cursor-pointer">Rule is Active</Label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <Label className="text-base font-semibold">Conditions</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddCondition}>
                  <PlusCircle className="h-4 w-4 mr-2" /> Add Condition
                </Button>
              </div>
              
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div key={index} className="flex gap-2 items-start bg-muted/30 p-3 rounded-md border">
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        value={condition.field}
                        onChange={(e) => handleConditionChange(index, "field", e.target.value)}
                      >
                        <option value="description">Description</option>
                        <option value="amount">Amount</option>
                        <option value="account_id">Account ID</option>
                        <option value="counterparty">Counterparty</option>
                      </select>
                      
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                        value={condition.operator}
                        onChange={(e) => handleConditionChange(index, "operator", e.target.value)}
                      >
                        <option value="contains">Contains</option>
                        <option value="equals">Equals</option>
                        <option value="greater than">Greater than</option>
                        <option value="less than">Less than</option>
                        <option value="starts with">Starts with</option>
                      </select>
                      
                      <Input
                        placeholder="Value"
                        value={condition.value}
                        onChange={(e) => handleConditionChange(index, "value", e.target.value)}
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => handleRemoveCondition(index)}
                      disabled={conditions.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="border-b pb-2">
                <Label className="text-base font-semibold">Actions (Apply these if match)</Label>
              </div>
              
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Suggest Category</Label>
                  <Input
                    placeholder="e.g. Food & Dining"
                    value={actions.suggest_category}
                    onChange={(e) => setActions(prev => ({ ...prev, suggest_category: e.target.value }))}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Suggest Type</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={actions.suggest_type}
                      onChange={(e) => setActions(prev => ({ ...prev, suggest_type: e.target.value }))}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  
                  <div className="grid gap-2">
                    <Label>Suggest Ownership</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={actions.suggest_ownership}
                      onChange={(e) => setActions(prev => ({ ...prev, suggest_ownership: e.target.value }))}
                    >
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                      <option value="shared">Shared</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="pt-4 border-t mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
