import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { calculateNextDueDate } from '@/lib/hooks/use-recurring';
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
      // Server-side scheduled execution using isolated admin client
      dbClient = createAdminClient();
    } else {
      // Regular user execution via RLS
      const userSupabase = await createClient();
      const { data: userData, error: authError } = await userSupabase.auth.getUser();

      if (authError || !userData?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      dbClient = userSupabase;
      targetUserId = userData.user.id;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch active recurring rules due today or overdue
    // DB columns: status (text), next_date (timestamptz)
    let query = dbClient
      .from('recurring_transactions')
      .select('*')
      .eq('status', 'active')
      .lte('next_date', todayStr);

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
      const occurrenceRef = `REC:${rule.id}:${rule.next_date}`;

      // Idempotency: check if already recorded via reference_id
      const { data: existingTx } = await (dbClient.from('transactions') as any)
        .select('id')
        .eq('user_id', rule.user_id)
        .eq('reference_id', occurrenceRef)
        .limit(1);

      if (existingTx && existingTx.length > 0) {
        // Already recorded — advance next_date to avoid getting stuck
        const nextDue = calculateNextDueDate(parseISO(rule.next_date), rule.frequency);
        await (dbClient.from('recurring_transactions') as any)
          .update({ next_date: format(nextDue, "yyyy-MM-dd'T'HH:mm:ssxxx") })
          .eq('id', rule.id);

        skippedIds.push(rule.id);
        continue;
      }

      const recType = (() => {
        const t = (rule.type || '').toLowerCase();
        if (t === 'transfer') return 'transfer';
        if (rule.direction === 'in') return 'income';
        return 'expense';
      })();

      const ledgerResult = await recordFinancialTransaction(dbClient as any, {
        userId: rule.user_id,
        type: recType,
        accountId: rule.account_id,
        categoryId: rule.category_id,
        description: rule.description,
        amount: rule.amount,
        date: rule.next_date ? rule.next_date.split('T')[0] : todayStr,
        idempotencyKey: occurrenceRef,
        sourceType: 'recurring',
        sourceId: rule.id,
        notes: '[Recurring scheduled transaction]',
        metadata: { frequency: rule.frequency },
      });

      if (!ledgerResult.success) {
        console.error(`Failed to post ledger entry for recurring rule ${rule.id}:`, ledgerResult.error);
        continue;
      }

      // Advance next_date by one frequency period
      const nextDue = calculateNextDueDate(parseISO(rule.next_date), rule.frequency);
      await (dbClient.from('recurring_transactions') as any)
        .update({ next_date: format(nextDue, "yyyy-MM-dd'T'HH:mm:ssxxx") })
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
