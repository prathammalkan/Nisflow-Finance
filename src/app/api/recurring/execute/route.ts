import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { calculateNextDueDate } from '@/lib/hooks/use-recurring';
import Decimal from 'decimal.js';
import { format, parseISO } from 'date-fns';
import crypto from 'node:crypto';
import { recordFinancialTransaction } from '@/lib/ledger/service';

/**
 * Constant-time comparison for bearer token authorization to prevent timing attacks.
 */
function isAuthorizedCron(authHeader: string | null, cronSecret: string | undefined): boolean {
  if (!authHeader || !cronSecret || cronSecret.trim().length === 0) {
    return false;
  }
  const expectedHeader = `Bearer ${cronSecret}`;
  const headerBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expectedHeader);

  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = isAuthorizedCron(authHeader, cronSecret);

    let dbClient: any;
    let targetUserId: string | null = null;

    if (isCronAuthorized) {
      // Server-side scheduled execution using isolated admin client to process system-wide due rules
      dbClient = createAdminClient();
    } else {
      // Regular user execution using standard user session and client RLS
      const userSupabase = await createClient();
      const { data: userData, error: authError } = await userSupabase.auth.getUser();

      if (authError || !userData?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      dbClient = userSupabase;
      targetUserId = userData.user.id;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch due active recurring rules
    let query = dbClient
      .from('recurring_transactions')
      .select('*')
      .eq('is_active', true)
      .lte('next_due_date', todayStr);

    // If regular authenticated user, filter strictly by their verified auth session user_id
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }

    const { data: dueRules, error: rulesError } = await query;
    if (rulesError) {
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }

    if (!dueRules || dueRules.length === 0) {
      return NextResponse.json({ message: 'No due recurring transactions to execute', processed: 0 });
    }

    const processedIds: string[] = [];
    const skippedIds: string[] = [];

    for (const rule of dueRules) {
      const occurrenceRef = `REC:${rule.id}:${rule.next_due_date}`;

      // Idempotency check: verify if a transaction with this deterministic key was already recorded
      const { data: existingTx } = await (dbClient.from('transactions') as any)
        .select('id')
        .eq('user_id', rule.user_id)
        .eq('bank_reference', occurrenceRef)
        .limit(1);

      if (existingTx && existingTx.length > 0) {
        // Already recorded — advance next_due_date to avoid getting stuck
        const nextDue = calculateNextDueDate(parseISO(rule.next_due_date), rule.frequency);
        const isPastEnd = rule.end_date && nextDue > parseISO(rule.end_date);

        await (dbClient.from('recurring_transactions') as any)
          .update({
            next_due_date: format(nextDue, 'yyyy-MM-dd'),
            last_created_date: todayStr,
            is_active: isPastEnd ? false : rule.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);

        skippedIds.push(rule.id);
        continue;
      }

      // Insert transaction into NisFlow double-entry ledger
      const recType = (rule.type || 'expense').toLowerCase() === 'transfer' ? 'transfer' : (rule.direction === 'in' ? 'income' : 'expense');
      
      const ledgerResult = await recordFinancialTransaction(dbClient as any, {
        userId: rule.user_id,
        type: recType,
        accountId: rule.account_id,
        categoryId: rule.category_id,
        counterpartyId: rule.counterparty_id,
        description: rule.description,
        amount: rule.amount,
        date: rule.next_due_date,
        idempotencyKey: occurrenceRef,
        sourceType: 'recurring',
        sourceId: rule.id,
        notes: rule.notes ? `[Recurring] ${rule.notes}` : '[Recurring scheduled transaction]',
        metadata: {
          ownership: rule.ownership || 'personal',
          frequency: rule.frequency,
        }
      });

      if (!ledgerResult.success) {
        console.error(`Failed to post ledger entry for recurring rule ${rule.id}:`, ledgerResult.error);
        continue;
      }

      // Advance next_due_date safely
      const nextDue = calculateNextDueDate(parseISO(rule.next_due_date), rule.frequency);
      const isPastEnd = rule.end_date && nextDue > parseISO(rule.end_date);

      await (dbClient.from('recurring_transactions') as any)
        .update({
          next_due_date: format(nextDue, 'yyyy-MM-dd'),
          last_created_date: todayStr,
          is_active: isPastEnd ? false : rule.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id);

      processedIds.push(rule.id);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processedIds.length} recurring transactions (${skippedIds.length} skipped as already executed)`,
      processedCount: processedIds.length,
      skippedCount: skippedIds.length,
    });
  } catch (err: any) {
    console.error('Recurring execution error occurred');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
