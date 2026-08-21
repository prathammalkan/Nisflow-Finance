"use client";

import { useState } from "react";
import { useRules, useDeleteRule } from "@/lib/hooks/use-rules";

import { Button } from "@/components/ui/button";
import { RuleForm } from "@/components/rules/rule-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PlusCircle, Wand2, Trash2, Edit, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function RulesPage() {
  const { data: rules, isLoading } = useRules();
  const deleteMutation = useDeleteRule();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const handleCreate = () => {
    setSelectedRule(null);
    setIsFormOpen(true);
  };

  const handleEdit = (rule: any) => {
    setSelectedRule(rule);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingRuleId(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transaction Rules</h2>
          <p className="text-muted-foreground mt-1">
            Rules automatically suggest categories for new transactions based on patterns.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse"></div>
          ))}
        </div>
      ) : rules?.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-lg border border-dashed">
          <Wand2 className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No rules yet</h3>
          <p className="mb-4 text-sm text-muted-foreground max-w-md mx-auto">
            Create rules to automatically categorize transactions, saving you time when importing or adding new entries.
          </p>
          <Button onClick={handleCreate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Create First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-amber-50/50 border border-amber-200/50 rounded-md p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 flex items-start">
            <AlertCircle className="h-5 w-5 mr-3 shrink-0" />
            <div>
              Rules are evaluated in order of priority (highest first). The first matching rule will be applied to incoming transactions.
            </div>
          </div>
          
          <div className="grid gap-4">
            {rules?.map((rule) => (
              <div 
                key={rule.id} 
                className={`bg-card rounded-lg border shadow-sm p-5 hover:border-primary/50 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${!rule.is_active ? 'opacity-60 grayscale' : ''}`}
                onClick={() => handleEdit(rule)}
              >
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{rule.name}</h3>
                    {!rule.is_active && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                    <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                      Priority: {rule.priority || 0}
                    </span>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1.5">
                      <div className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Conditions</div>
                      <div className="space-y-1">
                        {rule.conditions?.map((cond: any, idx: number) => (
                          <div key={idx} className="flex flex-wrap items-center gap-1.5">
                            {idx > 0 && <span className="text-muted-foreground font-medium text-xs">AND</span>}
                            <span className="bg-muted px-1.5 py-0.5 rounded text-xs">{cond.field}</span>
                            <span className="text-muted-foreground text-xs">{cond.operator}</span>
                            <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-xs">"{cond.value}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-1.5 md:border-l md:pl-4">
                      <div className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Actions</div>
                      <div className="space-y-1">
                        {rule.actions?.suggest_category && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">Category →</span>
                            <span className="font-medium">{rule.actions.suggest_category}</span>
                          </div>
                        )}
                        {rule.actions?.suggest_type && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">Type →</span>
                            <span className="font-medium capitalize">{rule.actions.suggest_type}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(rule); }}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={(e) => handleDelete(rule.id, e)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <RuleForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        initialData={selectedRule} 
      />

      <ConfirmDialog
        open={!!deletingRuleId}
        onOpenChange={(open) => { if (!open) setDeletingRuleId(null); }}
        title="Delete Transaction Rule"
        description="Are you sure you want to delete this auto-categorization rule?"
        confirmLabel="Delete Rule"
        onConfirm={() => {
          if (deletingRuleId) {
            deleteMutation.mutate(deletingRuleId);
            setDeletingRuleId(null);
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
