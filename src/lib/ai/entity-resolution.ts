import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type ResolutionStatus = 'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'SECURITY_VIOLATION' | 'INACTIVE';

export interface EntityResolutionResult<T> {
  status: ResolutionStatus;
  entity?: T;
  matches?: T[];
  error?: string;
  suggestedAction?: 'create' | 'choose' | 'activate';
}

export interface ResolveAccountQuery {
  id?: string;
  name?: string;
  type?: string;
  isInvestment?: boolean;
  requireActive?: boolean;
}

export interface ResolvePersonQuery {
  id?: string;
  name?: string;
  allowAutoProvision?: boolean;
}

export interface ResolveLoanQuery {
  id?: string;
  name?: string;
}

export interface ResolveInvestmentQuery {
  id?: string;
  symbol?: string;
  name?: string;
}

export interface ResolveCategoryQuery {
  id?: string;
  name?: string;
  type?: string;
}

export interface ResolveBudgetQuery {
  id?: string;
  categoryName?: string;
  month?: number;
  year?: number;
}

export interface ResolveSavingsGoalQuery {
  id?: string;
  name?: string;
}

export interface ResolveRecurringQuery {
  id?: string;
  description?: string;
}

export interface ResolveJournalEntryQuery {
  id?: string;
  description?: string;
}

/**
 * Resolves an account strictly within the authenticated user session.
 * Rejects cross-user access, detects inactive accounts, and flags multiple matches as ambiguous.
 */
export async function resolveAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: ResolveAccountQuery
): Promise<EntityResolutionResult<any>> {
  if (!userId) {
    return { status: 'SECURITY_VIOLATION', error: 'Authentication required for account resolution' };
  }

  // 1. Direct ID lookup
  if (query.id) {
    const { data: acc, error } = await (supabase.from('accounts') as any)
      .select('id, user_id, name, type, is_active, balance, current_balance')
      .eq('id', query.id)
      .maybeSingle();

    if (error || !acc) {
      return { status: 'NOT_FOUND', error: `Account with ID '${query.id}' was not found.` };
    }

    if (acc.user_id !== userId) {
      return {
        status: 'SECURITY_VIOLATION',
        error: `Security Violation: Account ${query.id} does not belong to authenticated user.`,
      };
    }

    if (query.requireActive !== false && !acc.is_active) {
      return {
        status: 'INACTIVE',
        entity: acc,
        error: `Account '${acc.name}' is inactive. Please activate it before proceeding.`,
        suggestedAction: 'activate',
      };
    }

    return { status: 'RESOLVED', entity: acc };
  }

  // 2. Name-based search
  if (query.name) {
    let dbQuery = (supabase.from('accounts') as any)
      .select('id, user_id, name, type, is_active, balance, current_balance')
      .eq('user_id', userId);

    if (query.requireActive !== false) {
      dbQuery = dbQuery.eq('is_active', true);
    }

    if (query.isInvestment) {
      dbQuery = dbQuery.eq('type', 'investment');
    }

    const { data: accounts, error } = await dbQuery;

    if (error || !accounts || accounts.length === 0) {
      return {
        status: 'NOT_FOUND',
        error: `No active account matching '${query.name}' was found in your accounts.`,
        suggestedAction: 'create',
      };
    }

    const cleanQuery = query.name.trim().toLowerCase();

    // Exact case-insensitive match
    const exactMatches = accounts.filter((a: any) => a.name?.trim().toLowerCase() === cleanQuery);
    if (exactMatches.length === 1) {
      return { status: 'RESOLVED', entity: exactMatches[0] };
    }

    // Substring contains match
    const subMatches = accounts.filter((a: any) => a.name?.toLowerCase().includes(cleanQuery));
    if (subMatches.length === 1) {
      return { status: 'RESOLVED', entity: subMatches[0] };
    }

    if (subMatches.length > 1) {
      return {
        status: 'AMBIGUOUS',
        matches: subMatches,
        error: `Multiple accounts matched '${query.name}' (${subMatches.map((a: any) => a.name).join(', ')}). Please specify which account to use.`,
        suggestedAction: 'choose',
      };
    }

    // If query was generic like "bank" or "account" and user has multiple
    if (accounts.length === 1 && !query.isInvestment) {
      return { status: 'RESOLVED', entity: accounts[0] };
    }

    return {
      status: 'NOT_FOUND',
      error: `No active account matching '${query.name}' found.`,
      suggestedAction: 'create',
    };
  }

  // 3. Fallback if no ID or name provided
  if (query.isInvestment) {
    const { data: invAccs } = await (supabase.from('accounts') as any)
      .select('id, user_id, name, type, is_active')
      .eq('user_id', userId)
      .eq('type', 'investment')
      .eq('is_active', true);

    if (!invAccs || invAccs.length === 0) {
      return {
        status: 'NOT_FOUND',
        error: 'An active investment/demat account is required before this investment can be recorded. Please create or link an investment account in Accounts.',
        suggestedAction: 'create',
      };
    }

    if (invAccs.length === 1) {
      return { status: 'RESOLVED', entity: invAccs[0] };
    }

    return {
      status: 'AMBIGUOUS',
      matches: invAccs,
      error: `Multiple investment accounts found (${invAccs.map((a: any) => a.name).join(', ')}). Please specify which investment account to use.`,
      suggestedAction: 'choose',
    };
  }

  return { status: 'NOT_FOUND', error: 'No account name or ID provided.' };
}

/**
 * Resolves a counterparty / person within the authenticated user session.
 */
export async function resolveCounterparty(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: ResolvePersonQuery
): Promise<EntityResolutionResult<any>> {
  if (!userId) {
    return { status: 'SECURITY_VIOLATION', error: 'Authentication required for person resolution' };
  }

  if (query.id) {
    const { data: cp, error } = await (supabase.from('counterparties') as any)
      .select('id, user_id, name, relationship, is_active')
      .eq('id', query.id)
      .maybeSingle();

    if (error || !cp) {
      return { status: 'NOT_FOUND', error: `Person with ID '${query.id}' not found.` };
    }

    if (cp.user_id !== userId) {
      return {
        status: 'SECURITY_VIOLATION',
        error: `Security Violation: Counterparty ${query.id} does not belong to authenticated user.`,
      };
    }

    return { status: 'RESOLVED', entity: cp };
  }

  if (query.name) {
    const cleanName = query.name.trim().toLowerCase();
    const { data: people, error } = await (supabase.from('counterparties') as any)
      .select('id, user_id, name, relationship, is_active')
      .eq('user_id', userId);

    if (!error && people && people.length > 0) {
      const exactMatches = people.filter((p: any) => p.name?.trim().toLowerCase() === cleanName);
      if (exactMatches.length === 1) {
        return { status: 'RESOLVED', entity: exactMatches[0] };
      }

      const subMatches = people.filter((p: any) => p.name?.toLowerCase().includes(cleanName));
      if (subMatches.length === 1) {
        return { status: 'RESOLVED', entity: subMatches[0] };
      }

      if (subMatches.length > 1) {
        return {
          status: 'AMBIGUOUS',
          matches: subMatches,
          error: `Multiple people matched '${query.name}' (${subMatches.map((p: any) => p.name).join(', ')}). Please specify.`,
          suggestedAction: 'choose',
        };
      }
    }

    if (query.allowAutoProvision) {
      // Provision new counterparty
      const { data: created, error: createErr } = await (supabase.from('counterparties') as any)
        .insert({
          user_id: userId,
          name: query.name.trim(),
          is_active: true,
        })
        .select()
        .single();

      if (!createErr && created) {
        return { status: 'RESOLVED', entity: created };
      }
    }

    return {
      status: 'NOT_FOUND',
      error: `Person '${query.name}' was not found in your people list.`,
      suggestedAction: 'create',
    };
  }

  return { status: 'NOT_FOUND', error: 'Person name or ID is required.' };
}

/**
 * Resolves a loan within the authenticated user session.
 */
export async function resolveLoan(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: ResolveLoanQuery
): Promise<EntityResolutionResult<any>> {
  if (!userId) {
    return { status: 'SECURITY_VIOLATION', error: 'Authentication required for loan resolution' };
  }

  if (query.id) {
    const { data: loan, error } = await (supabase.from('loans') as any)
      .select('id, user_id, name, loan_type, principal_amount, remaining_principal, is_deleted, status')
      .eq('id', query.id)
      .maybeSingle();

    if (error || !loan || loan.is_deleted) {
      return { status: 'NOT_FOUND', error: `Loan with ID '${query.id}' was not found.` };
    }

    if (loan.user_id !== userId) {
      return {
        status: 'SECURITY_VIOLATION',
        error: `Security Violation: Loan ${query.id} does not belong to authenticated user.`,
      };
    }

    return { status: 'RESOLVED', entity: loan };
  }

  if (query.name) {
    const cleanName = query.name.trim().toLowerCase();
    const { data: loans, error } = await (supabase.from('loans') as any)
      .select('id, user_id, name, loan_type, principal_amount, remaining_principal, is_deleted, status')
      .eq('user_id', userId)
      .or('is_deleted.is.null,is_deleted.eq.false');

    if (error || !loans || loans.length === 0) {
      return {
        status: 'NOT_FOUND',
        error: `No active loans found matching '${query.name}'.`,
        suggestedAction: 'create',
      };
    }

    const exactMatches = loans.filter((l: any) => l.name?.trim().toLowerCase() === cleanName);
    if (exactMatches.length === 1) {
      return { status: 'RESOLVED', entity: exactMatches[0] };
    }

    const subMatches = loans.filter((l: any) => l.name?.toLowerCase().includes(cleanName));
    if (subMatches.length === 1) {
      return { status: 'RESOLVED', entity: subMatches[0] };
    }

    if (subMatches.length > 1) {
      return {
        status: 'AMBIGUOUS',
        matches: subMatches,
        error: `Multiple loans matched '${query.name}' (${subMatches.map((l: any) => l.name).join(', ')}). Please specify.`,
        suggestedAction: 'choose',
      };
    }

    return {
      status: 'NOT_FOUND',
      error: `No active loan matching '${query.name}' found.`,
      suggestedAction: 'create',
    };
  }

  return { status: 'NOT_FOUND', error: 'Loan name or ID is required.' };
}

/**
 * Resolves a category from transaction_categories
 */
export async function resolveCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: ResolveCategoryQuery
): Promise<EntityResolutionResult<any>> {
  if (query.id) {
    const { data: cat } = await (supabase.from('transaction_categories') as any)
      .select('id, user_id, name, type')
      .eq('id', query.id)
      .maybeSingle();

    if (cat && (cat.user_id === userId || cat.is_system)) {
      return { status: 'RESOLVED', entity: cat };
    }
    return { status: 'NOT_FOUND', error: `Category with ID '${query.id}' not found.` };
  }

  if (query.name) {
    const cleanName = query.name.trim().toLowerCase();
    const { data: cats } = await (supabase.from('transaction_categories') as any)
      .select('id, user_id, name, type, is_system')
      .or(`user_id.eq.${userId},is_system.eq.true`);

    if (cats && cats.length > 0) {
      const matched = cats.find((c: any) => c.name?.toLowerCase() === cleanName || c.name?.toLowerCase().includes(cleanName));
      if (matched) {
        return { status: 'RESOLVED', entity: matched };
      }
    }
  }

  return { status: 'NOT_FOUND', error: `Category '${query.name || query.id}' not found.` };
}

/**
 * Resolves an original journal entry for reversals
 */
export async function resolveJournalEntry(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: ResolveJournalEntryQuery
): Promise<EntityResolutionResult<any>> {
  if (!userId) {
    return { status: 'SECURITY_VIOLATION', error: 'Authentication required for journal entry resolution' };
  }

  if (query.id) {
    const { data: entry, error } = await (supabase.from('journal_entries') as any)
      .select(`
        id,
        user_id,
        entry_number,
        transaction_date,
        description,
        source_type,
        status,
        reversal_of_id
      `)
      .eq('id', query.id)
      .maybeSingle();

    if (error || !entry) {
      return { status: 'NOT_FOUND', error: `Journal entry '${query.id}' was not found.` };
    }

    if (entry.user_id !== userId) {
      return {
        status: 'SECURITY_VIOLATION',
        error: `Security Violation: Journal entry ${query.id} does not belong to authenticated user.`,
      };
    }

    if (entry.status === 'reversed') {
      return {
        status: 'INACTIVE',
        entity: entry,
        error: `Journal entry '${entry.description}' (${entry.id}) has already been reversed.`,
      };
    }

    return { status: 'RESOLVED', entity: entry };
  }

  return { status: 'NOT_FOUND', error: 'Journal entry ID is required for reversal.' };
}
