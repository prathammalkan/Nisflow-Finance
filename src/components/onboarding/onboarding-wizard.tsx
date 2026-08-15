'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Wallet,
  ArrowRightLeft,
  Users,
  TrendingUp,
  Target,
  BarChart3,
  Shield,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  FileText,
  Banknote,
} from 'lucide-react';
import { AccountForm } from '@/components/accounts/account-form';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { cn } from '@/lib/utils';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

interface Slide {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  features: { icon: React.ElementType; text: string }[];
}

const slides: Slide[] = [
  {
    icon: Building2,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    title: 'Welcome to NisFlow Finance',
    subtitle:
      'Your complete personal finance command center. Built on one principle: Where did the money come from, who owns it, why did it move, and can you prove it?',
    features: [
      { icon: Shield, text: 'Bank-grade security with row-level data isolation' },
      { icon: Banknote, text: 'Decimal-precise arithmetic — no floating-point errors' },
      { icon: FileText, text: 'Full audit trail on every transaction' },
    ],
  },
  {
    icon: Wallet,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
    title: 'Accounts & Balances',
    subtitle:
      'Track every bank account, wallet, cash pocket, and investment account in one place. All balances update automatically as you record transactions.',
    features: [
      { icon: Wallet, text: 'Banks, wallets, cash, savings, and investment accounts' },
      { icon: CheckCircle2, text: 'Mark personal vs. shared ownership clearly' },
      { icon: BarChart3, text: 'Monthly reconciliation to catch discrepancies' },
    ],
  },
  {
    icon: ArrowRightLeft,
    iconColor: 'text-violet-600',
    iconBg: 'bg-violet-50',
    title: 'Transactions & Ledger',
    subtitle:
      'Log every rupee in and out. Income, expenses, transfers, and third-party funds. Every transaction has a clear source, destination, and reason.',
    features: [
      { icon: ArrowRightLeft, text: 'Income, expenses, and internal transfers' },
      { icon: Users, text: 'Third-party funds tracked separately — never mixed with personal money' },
      { icon: FileText, text: 'Attach receipts and documents to any transaction' },
    ],
  },
  {
    icon: Users,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
    title: 'People — Receivables & Payables',
    subtitle:
      'Know exactly who owes you money and whom you owe. Track partial repayments, set due dates, and get reminders automatically.',
    features: [
      { icon: ArrowDownToLine, text: 'Receivables — money others owe you, with aging tracking' },
      { icon: ArrowUpFromLine, text: 'Payables — money you owe, so nothing is forgotten' },
      { icon: Users, text: 'Bill splitting — split group expenses and track each share' },
    ],
  },
  {
    icon: TrendingUp,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    title: 'IPOs & Investments',
    subtitle:
      'Track your investment portfolio from application to listing. Record every IPO you applied for and monitor mutual funds, stocks, and FDs.',
    features: [
      { icon: TrendingUp, text: 'IPO applications — applied amount, allotment, listing gains' },
      { icon: BarChart3, text: 'Investments — portfolio value and return tracking' },
      { icon: Receipt, text: 'Loan calculator — EMI and interest breakdown built in' },
    ],
  },
  {
    icon: Target,
    iconColor: 'text-rose-600',
    iconBg: 'bg-rose-50',
    title: 'Budgets & Savings Goals',
    subtitle:
      'Set monthly budgets per category and measure your savings progress. Know if you are on track before the month ends.',
    features: [
      { icon: Target, text: 'Category budgets with real-time usage tracking' },
      { icon: BarChart3, text: 'Savings goals with progress bars and target dates' },
      { icon: CheckCircle2, text: 'Spending analysis — daily and monthly trends' },
    ],
  },
  {
    icon: BarChart3,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-50',
    title: 'Reports & Tax Records',
    subtitle:
      'Generate financial reports in seconds. Export to CSV or PDF. Maintain tax records year-wise for every financial year with deductions and capital gains.',
    features: [
      { icon: BarChart3, text: '7 report types — personal finance, spending, IPO, investment, tax' },
      { icon: Receipt, text: 'Tax records — income, deductions, capital gains per financial year' },
      { icon: FileText, text: 'One-click PDF statements for any person or period' },
    ],
  },
  {
    icon: Shield,
    iconColor: 'text-gray-700',
    iconBg: 'bg-gray-100',
    title: 'Security & Privacy',
    subtitle:
      'Your financial data belongs only to you. Every piece of data is isolated by your user ID at the database level. Biometric lock adds a second layer.',
    features: [
      { icon: Shield, text: 'Row-level security — no one can read your data, ever' },
      { icon: CheckCircle2, text: 'Biometric app lock — fingerprint or Face ID on supported devices' },
      { icon: FileText, text: 'Full data export — download everything as JSON or SQL anytime' },
    ],
  },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const { data: accounts } = useAccounts();

  const isTourComplete = slideIndex >= slides.length;
  const currentSlide = slides[slideIndex];
  const totalTourSlides = slides.length;

  const next = () => setSlideIndex((i) => Math.min(i + 1, totalTourSlides));
  const prev = () => setSlideIndex((i) => Math.max(i - 1, 0));

  const finish = () => {
    try {
      localStorage.setItem('nisflow_onboarding_completed', 'true');
    } catch (_) {}
    if (onComplete) {
      onComplete();
    } else {
      window.location.href = '/dashboard';
    }
  };

  // Setup slide (after tour)
  if (isTourComplete && !done) {
    return (
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-background/90 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="w-full max-w-lg my-auto">
          {/* Progress */}
          <div className="mb-6 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-1.5 w-8 rounded-full bg-primary" />
            ))}
            <div className="h-1.5 w-8 rounded-full bg-primary/30" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-50 to-blue-50 px-8 py-10 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-md">
                <Wallet className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Add your first account</h2>
              <p className="mt-2 text-gray-600 text-sm leading-relaxed max-w-sm mx-auto">
                To start tracking your finances, add at least one bank account or wallet. This will be your financial baseline.
              </p>
            </div>

            <div className="p-6">
              {accounts && accounts.length > 0 ? (
                <div className="space-y-2 mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Accounts added:</p>
                  {accounts.map((acc: any) => (
                    <div key={acc.id} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-100">
                      <span className="text-sm font-medium text-gray-900">{acc.name}</span>
                      <span className="text-sm text-gray-500">₹{acc.balance}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400 text-sm mb-4">No accounts added yet.</div>
              )}

              <button
                onClick={() => setShowAccountForm(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-primary hover:text-primary text-gray-500 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <span className="text-lg leading-none">+</span>
                Add an Account
              </button>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={prev}
                className="flex items-center gap-1.5 px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                disabled={!accounts || accounts.length === 0}
                onClick={finish}
                className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-semibold transition-colors"
              >
                <CheckCircle2 size={18} />
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
        <AccountForm open={showAccountForm} onOpenChange={setShowAccountForm} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-background/90 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-auto">
        {/* Progress dots */}
        <div className="mb-6 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i < slideIndex
                  ? 'w-8 bg-primary'
                  : i === slideIndex
                  ? 'w-10 bg-primary'
                  : 'w-8 bg-gray-200'
              )}
            />
          ))}
          {/* Setup step dot */}
          <div className="h-1.5 w-8 rounded-full bg-gray-200" />
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden">
          {/* Icon + Header */}
          <div className="px-8 pt-10 pb-6 text-center">
            <div
              className={cn(
                'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl',
                currentSlide.iconBg
              )}
            >
              <currentSlide.icon className={cn('h-10 w-10', currentSlide.iconColor)} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 leading-snug">{currentSlide.title}</h2>
            <p className="mt-3 text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
              {currentSlide.subtitle}
            </p>
          </div>

          {/* Features list */}
          <div className="px-8 pb-8 space-y-3">
            {currentSlide.features.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-200">
                  <Icon className="h-3.5 w-3.5 text-gray-600" />
                </div>
                <p className="text-sm text-gray-700 leading-snug">{text}</p>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="px-8 pb-8 flex items-center justify-between gap-3">
            <button
              onClick={prev}
              disabled={slideIndex === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-0 disabled:pointer-events-none rounded-lg text-sm font-medium transition-all"
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <div className="text-xs text-gray-400 font-medium">
              {slideIndex + 1} of {totalTourSlides}
            </div>

            <button
              onClick={next}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {slideIndex === totalTourSlides - 1 ? (
                <>Set Up Account <CheckCircle2 size={15} /></>
              ) : (
                <>Next <ChevronRight size={15} /></>
              )}
            </button>
          </div>
        </div>

        {/* Small note at bottom */}
        <p className="text-center text-xs text-gray-400 mt-4">
          NisFlow Finance · Your data never leaves your account
        </p>
      </div>
    </div>
  );
}
