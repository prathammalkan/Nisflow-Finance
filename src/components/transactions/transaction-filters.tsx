"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export function TransactionFilters({ filters, onChange }: { filters: any, onChange: (f: any) => void }) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search transactions..." 
            className="pl-8"
            value={filters.search || ''}
            onChange={(e) => onChange({ search: e.target.value })}
          />
        </div>
        
        <Select 
          className="w-[150px]"
          value={filters.transaction_type?.[0] || 'all'} 
          onChange={(e) => onChange({ transaction_type: e.target.value === 'all' ? undefined : [e.target.value] })}
        >
          <option value="" disabled hidden>Type</option>
          <option value="all">All Types</option>
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
          <option value="Transfer">Transfer</option>
        </Select>

        <Select 
          className="w-[150px]"
          value={filters.ownership || 'all'} 
          onChange={(e) => onChange({ ownership: e.target.value === 'all' ? undefined : e.target.value })}
        >
          <option value="" disabled hidden>Ownership</option>
          <option value="all">All Ownership</option>
          <option value="personal">Personal</option>
          <option value="third_party">Third Party</option>
        </Select>

        <Select 
          className="w-[150px]"
          value={filters.status?.[0] || 'all'} 
          onChange={(e) => onChange({ status: e.target.value === 'all' ? undefined : [e.target.value] })}
        >
          <option value="" disabled hidden>Status</option>
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="reconciled">Reconciled</option>
        </Select>
        
        {(filters.search || filters.transaction_type || filters.ownership || filters.status) && (
          <Button 
            variant="ghost" 
            onClick={() => onChange({ 
              search: undefined, 
              transaction_type: undefined, 
              ownership: undefined, 
              status: undefined 
            })}
            className="px-2"
          >
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
