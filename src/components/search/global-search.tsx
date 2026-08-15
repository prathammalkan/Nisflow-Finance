'use client';

import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

interface SearchResult {
  id: string;
  type: 'transaction' | 'person' | 'account';
  label: string;
  sub: string;
  href: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();

      const [{ data: txns }, { data: people }, { data: accounts }] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, description, amount, type, date')
          .ilike('description', `%${q}%`)
          .order('date', { ascending: false })
          .limit(5),
        supabase
          .from('counterparties')
          .select('id, name, phone')
          .ilike('name', `%${q}%`)
          .limit(5),
        supabase
          .from('accounts')
          .select('id, name, balance, type')
          .ilike('name', `%${q}%`)
          .limit(3),
      ]);

      const mapped: SearchResult[] = [];

      (txns as any[] || []).forEach((t) =>
        mapped.push({
          id: t.id,
          type: 'transaction',
          label: t.description || 'Transaction',
          sub: `${t.type} · ${formatINR(new Decimal(t.amount || 0))} · ${new Date(t.date).toLocaleDateString('en-IN')}`,
          href: '/transactions',
        })
      );

      (people as any[] || []).forEach((p) =>
        mapped.push({
          id: p.id,
          type: 'person',
          label: p.name,
          sub: p.phone || 'Person',
          href: `/people/${p.id}`,
        })
      );

      (accounts as any[] || []).forEach((a) =>
        mapped.push({
          id: a.id,
          type: 'account',
          label: a.name,
          sub: `${a.type} · ${formatINR(new Decimal(a.balance || 0))}`,
          href: '/accounts',
        })
      );

      setResults(mapped);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const navigate = (href: string) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(href);
  };

  return (
    <>
      <button
        id="global-search-trigger"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-md w-56 transition-colors border border-gray-200"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-gray-500">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Mobile search icon */}
      <button
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted"
        onClick={() => setOpen(true)}
        title="Search"
      >
        <Search className="w-5 h-5 text-gray-500" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setOpen(false); setQuery(''); setResults([]); }}
          />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search transactions, people, accounts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder:text-gray-400"
              />
              <kbd className="text-xs text-gray-400 border rounded px-1">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Searching…</div>
              )}
              {!loading && query && results.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No results for "{query}"</div>
              )}
              {!loading && !query && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Start typing to search across your finances…</div>
              )}
              {results.length > 0 && (
                <div className="py-2">
                  {['transaction', 'person', 'account'].map((type) => {
                    const group = results.filter((r) => r.type === type);
                    if (!group.length) return null;
                    const heading = type === 'transaction' ? 'Transactions' : type === 'person' ? 'People' : 'Accounts';
                    return (
                      <div key={type}>
                        <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{heading}</div>
                        {group.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => navigate(r.href)}
                            className="w-full flex flex-col px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                          >
                            <span className="text-sm font-medium text-gray-900">{r.label}</span>
                            <span className="text-xs text-gray-500 mt-0.5">{r.sub}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
