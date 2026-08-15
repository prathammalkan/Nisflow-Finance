'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useNetWorthHistory } from '@/lib/hooks/use-net-worth-history';
import { formatINR } from '@/lib/finance/money';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { parseISO, format } from 'date-fns';

export function NetWorthChart() {
  const [months, setMonths] = useState<number>(12);
  const { data: history, isLoading } = useNetWorthHistory(months);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Net Worth Over Time</CardTitle>
        <div className="space-x-2">
          <Button
            variant={months === 6 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setMonths(6)}
          >
            6M
          </Button>
          <Button
            variant={months === 12 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setMonths(12)}
          >
            12M
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-[280px] pt-4">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : history && history.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="period"
                tickFormatter={(val) => {
                  try {
                    // val is 'YYYY-MM', parse appropriately
                    return format(parseISO(`${val}-01`), 'MMM yy');
                  } catch (e) {
                    return val;
                  }
                }}
                className="text-xs text-muted-foreground"
              />
              <YAxis
                className="text-xs text-muted-foreground"
                tickFormatter={(val) => {
                  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
                  return `₹${val}`;
                }}
              />
              <Tooltip
                formatter={(value: any, name: unknown) => {
                  const n = String(name ?? '');
                  return [formatINR(Number(value)), n === 'net_worth' ? 'Net Worth' : n === 'personal_cash' ? 'Personal Cash' : 'Investments'];
                }}
                labelFormatter={(label: unknown) => {
                  try {
                    return format(parseISO(`${String(label ?? '')}-01`), 'MMMM yyyy');
                  } catch {
                    return String(label ?? '');
                  }
                }}
              />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.15}
                name="net_worth"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground p-4">
            <p>Track your net worth over time — check back next month to see your progress</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
