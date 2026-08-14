'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-md w-64 transition-colors border border-gray-200"
      >
        <Search className="w-4 h-4" />
        <span>Search...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-gray-500 opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search across your finances..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Transactions">
            <CommandItem onSelect={() => { setOpen(false); router.push('/transactions'); }}>
              Salary Deposit - ₹1,00,000
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="People">
            <CommandItem onSelect={() => { setOpen(false); router.push('/people'); }}>
              Alice - ₹5,000 Receivable
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Accounts">
            <CommandItem onSelect={() => { setOpen(false); router.push('/accounts'); }}>
              HDFC Bank - Checking
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
