'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.trim();

        // Search transactions
        const { data: txs } = await supabase
          .from('transactions')
          .select('id, description, amount, direction, date')
          .ilike('description', `%${q}%`)
          .limit(5);

        // Search counterparties
        const { data: people } = await supabase
          .from('counterparties')
          .select('id, name, type')
          .ilike('name', `%${q}%`)
          .limit(5);

        // Search accounts
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, name, type, balance')
          .ilike('name', `%${q}%`)
          .limit(5);

        const formattedResults: SearchResult[] = [
          ...(txs || []).map((t: any) => ({
            id: t.id,
            type: 'transaction' as const,
            label: t.description || 'Transaction',
            sub: `${t.direction === 'in' ? '+' : '-'}${formatINR(new Decimal(t.amount || 0))} · ${t.date ? new Date(t.date).toLocaleDateString() : ''}`,
            href: `/transactions`,
          })),
          ...(people || []).map((p: any) => ({
            id: p.id,
            type: 'person' as const,
            label: p.name,
            sub: p.type || 'Contact',
            href: `/people/${p.id}`,
          })),
          ...(accounts || []).map((a: any) => ({
            id: a.id,
            type: 'account' as const,
            label: a.name,
            sub: `${a.type} · ${formatINR(new Decimal(a.balance || 0))}`,
            href: `/accounts/${a.id}`,
          })),
        ];

        setResults(formattedResults);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, supabase]);

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
        className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 hover:bg-muted px-3 py-2 rounded-xl w-56 transition-colors border border-border"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left font-medium">Search…</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-card px-1.5 font-mono text-[10px] font-semibold text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Mobile search icon */}
      <button
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl hover:bg-muted text-muted-foreground"
        onClick={() => setOpen(true)}
        title="Search"
      >
        <Search className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => { setOpen(false); setQuery(''); setResults([]); }}
          />
          <div className="relative w-full max-w-lg bg-card text-card-foreground rounded-2xl shadow-2xl overflow-hidden border border-border">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search transactions, people, accounts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
              />
              <kbd className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 bg-muted">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Searching…</div>
              )}
              {!loading && query && results.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">No results for &quot;{query}&quot;</div>
              )}
              {!loading && !query && (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Start typing to search across your finances…</div>
              )}
              {results.length > 0 && (
                <div className="py-2">
                  {['transaction', 'person', 'account'].map((type) => {
                    const group = results.filter((r) => r.type === type);
                    if (!group.length) return null;
                    const heading = type === 'transaction' ? 'Transactions' : type === 'person' ? 'People' : 'Accounts';
                    return (
                      <div key={type}>
                        <div className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{heading}</div>
                        {group.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => navigate(r.href)}
                            className="w-full flex flex-col px-4 py-2.5 hover:bg-muted/50 text-left transition-colors"
                          >
                            <span className="text-sm font-medium text-foreground">{r.label}</span>
                            <span className="text-xs text-muted-foreground mt-0.5">{r.sub}</span>
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
