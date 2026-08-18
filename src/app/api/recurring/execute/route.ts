import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateNextDueDate } from '@/lib/hooks/use-recurring';
import Decimal from 'decimal.js';
import { format, parseISO } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    // Check optional CRON_SECRET header for scheduled invocation
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!userData.user && !isCronAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Fetch due active recurring rules
    let query = (supabase.from('recurring_transactions') as any)
      .select('*')
      .eq('is_active', true)
      .lte('next_due_date', todayStr);

    // If regular authenticated user, filter by their user_id
    if (userData.user && !isCronAuthorized) {
      query = query.eq('user_id', userData.user.id);
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
      const { data: existingTx } = await (supabase.from('transactions') as any)
        .select('id')
        .eq('user_id', rule.user_id)
        .eq('bank_reference', occurrenceRef)
        .limit(1);

      if (existingTx && existingTx.length > 0) {
        // Already recorded — advance next_due_date to avoid getting stuck
        const nextDue = calculateNextDueDate(parseISO(rule.next_due_date), rule.frequency);
        const isPastEnd = rule.end_date && nextDue > parseISO(rule.end_date);

        await (supabase.from('recurring_transactions') as any)
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

      // Insert transaction into NisFlow ledger
      const txAmount = new Decimal(rule.amount || 0).toNumber();
      const { error: insertError } = await (supabase.from('transactions') as any)
        .insert({
          user_id: rule.user_id,
          account_id: rule.account_id,
          category_id: rule.category_id,
          counterparty_id: rule.counterparty_id,
          description: rule.description,
          amount: txAmount,
          transaction_type: rule.type,
          direction: rule.direction,
          ownership: rule.ownership || 'personal',
          status: 'confirmed',
          date: rule.next_due_date,
          bank_reference: occurrenceRef,
          notes: rule.notes ? `[Recurring] ${rule.notes}` : '[Recurring scheduled transaction]',
        });

      if (insertError) {
        console.error(`Failed to create transaction for recurring rule ${rule.id}:`, insertError);
        continue;
      }

      // Advance next_due_date safely
      const nextDue = calculateNextDueDate(parseISO(rule.next_due_date), rule.frequency);
      const isPastEnd = rule.end_date && nextDue > parseISO(rule.end_date);

      await (supabase.from('recurring_transactions') as any)
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
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
