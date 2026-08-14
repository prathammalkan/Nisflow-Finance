import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';

export function usePersonalFinanceReport(dateRange: string) {
  const [data, setData] = useState({ income: new Decimal(0), expenses: new Decimal(0), savings: new Decimal(0), investments: new Decimal(0), netWorth: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ income: new Decimal(100000), expenses: new Decimal(40000), savings: new Decimal(20000), investments: new Decimal(30000), netWorth: new Decimal(500000) });
      setLoading(false);
    }, 500);
  }, [dateRange]);
  return { data, loading };
}

export function useAccountReport(accountId: string, dateRange: string) {
  const [data, setData] = useState({ opening: new Decimal(0), inflows: new Decimal(0), outflows: new Decimal(0), closing: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ opening: new Decimal(50000), inflows: new Decimal(20000), outflows: new Decimal(10000), closing: new Decimal(60000) });
      setLoading(false);
    }, 500);
  }, [accountId, dateRange]);
  return { data, loading };
}

export function useSpendingReport(dateRange: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData([{ category: 'Food', amount: new Decimal(15000) }, { category: 'Transport', amount: new Decimal(5000) }]);
      setLoading(false);
    }, 500);
  }, [dateRange]);
  return { data, loading };
}

export function useThirdPartyReport(dateRange: string) {
  const [data, setData] = useState({ received: new Decimal(0), used: new Decimal(0), returned: new Decimal(0), outstanding: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ received: new Decimal(100000), used: new Decimal(60000), returned: new Decimal(30000), outstanding: new Decimal(10000) });
      setLoading(false);
    }, 500);
  }, [dateRange]);
  return { data, loading };
}

export function useIPOReport() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData([{ name: 'Tech Corp IPO', applied: new Decimal(15000), allotted: true, currentValue: new Decimal(20000) }]);
      setLoading(false);
    }, 500);
  }, []);
  return { data, loading };
}

export function useInvestmentReport() {
  const [data, setData] = useState({ totalInvested: new Decimal(0), currentValue: new Decimal(0), returns: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ totalInvested: new Decimal(100000), currentValue: new Decimal(120000), returns: new Decimal(20000) });
      setLoading(false);
    }, 500);
  }, []);
  return { data, loading };
}

export function usePeopleReport() {
  const [data, setData] = useState({ receivables: new Decimal(0), payables: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ receivables: new Decimal(25000), payables: new Decimal(5000) });
      setLoading(false);
    }, 500);
  }, []);
  return { data, loading };
}

export function useTaxReport(financialYear: string) {
  const [data, setData] = useState({ totalIncome: new Decimal(0), deductions: new Decimal(0), capitalGains: new Decimal(0), investmentIncome: new Decimal(0) });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setData({ totalIncome: new Decimal(1200000), deductions: new Decimal(150000), capitalGains: new Decimal(50000), investmentIncome: new Decimal(25000) });
      setLoading(false);
    }, 500);
  }, [financialYear]);
  return { data, loading };
}
