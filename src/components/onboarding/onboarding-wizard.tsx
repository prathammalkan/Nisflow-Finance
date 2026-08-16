'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Smartphone,
  Download,
  Share2,
  MoreVertical,
  PlusSquare,
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
  Sparkles,
  Laptop,
} from 'lucide-react';
import { AccountForm } from '@/components/accounts/account-form';
import { useAccounts } from '@/lib/hooks/use-accounts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface OnboardingWizardProps {
  onComplete?: () => void;
}

interface FeatureItem {
  icon: React.ElementType;
  text: string;
}

interface Slide {
  type?: 'install' | 'feature';
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  features?: FeatureItem[];
}

const slides: Slide[] = [
  {
    type: 'install',
    icon: Smartphone,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10',
    title: 'Install NisFlow on Your Mobile',
    subtitle: 'NisFlow is an installable PWA designed for lightning-fast mobile performance with full offline support and instant launch.',
  },
  {
    type: 'feature',
    icon: Building2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-500/10',
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
    type: 'feature',
    icon: Wallet,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-500/10',
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
    type: 'feature',
    icon: ArrowRightLeft,
    iconColor: 'text-violet-600 dark:text-violet-400',
    iconBg: 'bg-violet-500/10',
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
    type: 'feature',
    icon: Users,
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-500/10',
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
    type: 'feature',
    icon: TrendingUp,
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    iconBg: 'bg-indigo-500/10',
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
    type: 'feature',
    icon: Target,
    iconColor: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-500/10',
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
    type: 'feature',
    icon: Shield,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/10',
    title: 'Security & Biometrics',
    subtitle:
      'Your financial data belongs only to you. Every piece of data is isolated by your user ID at the database level with biometric device protection.',
    features: [
      { icon: Shield, text: 'Row-level security — no one can read your data, ever' },
      { icon: CheckCircle2, text: 'Biometric app lock — fingerprint or Face ID' },
      { icon: FileText, text: 'Full data export — download everything as JSON or SQL anytime' },
    ],
  },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<'android' | 'ios' | 'desktop'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const router = useRouter();
  const { data: accounts } = useAccounts();

  useEffect(() => {
    // Detect iOS vs Android
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setSelectedPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setSelectedPlatform('android');
    } else {
      setSelectedPlatform('desktop');
    }

    // Capture PWA install event on supported browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        toast.success('NisFlow Finance installed successfully!');
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    }
  };

  const isTourComplete = slideIndex >= slides.length;
  const currentSlide = slides[slideIndex];
  const totalTourSlides = slides.length;

  const next = () => setSlideIndex((i) => Math.min(i + 1, totalTourSlides));
  const prev = () => setSlideIndex((i) => Math.max(i - 1, 0));

  const finish = async () => {
    // Persist cross-device in Supabase user_metadata (no extra table, zero cost)
    try {
      const supabase = createClient();
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
    } catch (_) {}
    // Also cache locally so same device skips the extra auth call
    try { localStorage.setItem('nisflow_onboarding_completed', 'true'); } catch (_) {}
    if (onComplete) {
      onComplete();
    } else {
      window.location.href = '/dashboard';
    }
  };

  // Setup slide (after tour)
  if (isTourComplete) {
    return (
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-background/80 backdrop-blur-md p-4 overflow-y-auto">
        <div className="w-full max-w-lg my-auto">
          {/* Progress */}
          <div className="mb-6 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <div key={i} className="h-1.5 w-8 rounded-full bg-primary" />
            ))}
            <div className="h-1.5 w-8 rounded-full bg-primary" />
          </div>

          <div className="bg-card text-card-foreground rounded-2xl border shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 px-8 py-10 text-center border-b">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-sm">
                <Wallet className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Add your first account</h2>
              <p className="mt-2 text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                To start tracking your finances, add at least one bank account or cash wallet as your financial baseline.
              </p>
            </div>

            <div className="p-6">
              {accounts && accounts.length > 0 ? (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Accounts Added ({accounts.length}):
                  </p>
                  {accounts.map((acc: any) => (
                    <div key={acc.id} className="flex justify-between items-center bg-muted/60 rounded-xl px-4 py-3 border">
                      <span className="text-sm font-medium">{acc.name}</span>
                      <span className="text-sm font-semibold text-primary">₹{acc.balance}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm mb-4">
                  No accounts added yet. Click below to add one.
                </div>
              )}

              <button
                onClick={() => setShowAccountForm(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-primary hover:text-primary rounded-xl py-3.5 text-sm font-medium transition-colors"
              >
                <span className="text-lg leading-none">+</span>
                Add an Account
              </button>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={prev}
                className="flex items-center gap-1.5 px-4 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl text-sm font-medium transition-colors"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={finish}
                className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-3 text-sm font-semibold shadow transition-colors"
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
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-background/80 backdrop-blur-md p-4 overflow-y-auto">
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
                  : 'w-8 bg-muted'
              )}
            />
          ))}
          {/* Setup step dot */}
          <div className="h-1.5 w-8 rounded-full bg-muted" />
        </div>

        <div className="bg-card text-card-foreground rounded-2xl border shadow-2xl overflow-hidden">
          {/* Icon + Header */}
          <div className="px-8 pt-8 pb-4 text-center">
            <div
              className={cn(
                'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border',
                currentSlide.iconBg
              )}
            >
              <currentSlide.icon className={cn('h-8 w-8', currentSlide.iconColor)} />
            </div>
            <h2 className="text-xl font-bold leading-snug">{currentSlide.title}</h2>
            <p className="mt-2 text-muted-foreground text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
              {currentSlide.subtitle}
            </p>
          </div>

          {/* Slide Content */}
          <div className="px-6 pb-6">
            {currentSlide.type === 'install' ? (
              <div className="space-y-4">
                {/* Platform tabs */}
                <div className="grid grid-cols-3 gap-1 bg-muted p-1 rounded-xl">
                  <button
                    onClick={() => setSelectedPlatform('android')}
                    className={cn(
                      'py-1.5 text-xs font-semibold rounded-lg transition-all',
                      selectedPlatform === 'android'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Android
                  </button>
                  <button
                    onClick={() => setSelectedPlatform('ios')}
                    className={cn(
                      'py-1.5 text-xs font-semibold rounded-lg transition-all',
                      selectedPlatform === 'ios'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    iPhone (iOS)
                  </button>
                  <button
                    onClick={() => setSelectedPlatform('desktop')}
                    className={cn(
                      'py-1.5 text-xs font-semibold rounded-lg transition-all',
                      selectedPlatform === 'desktop'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Desktop
                  </button>
                </div>

                {/* Platform specific instructions */}
                {selectedPlatform === 'android' && (
                  <div className="space-y-2.5 bg-muted/40 p-4 rounded-xl border">
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        1
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Open in <strong>Chrome</strong> browser on your Android device.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        2
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Tap the <MoreVertical className="inline h-3.5 w-3.5 mx-0.5 text-foreground" /> (three dots) menu in the top-right corner.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        3
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Tap <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home screen&rdquo;</strong>.
                      </p>
                    </div>
                    {isInstallable && (
                      <button
                        onClick={handleInstallClick}
                        className="w-full mt-2 flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl py-2.5 text-xs font-semibold transition-colors"
                      >
                        <Download className="h-4 w-4" /> Tap to Install Now
                      </button>
                    )}
                  </div>
                )}

                {selectedPlatform === 'ios' && (
                  <div className="space-y-2.5 bg-muted/40 p-4 rounded-xl border">
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        1
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Open in <strong>Safari</strong> browser on your iPhone or iPad.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        2
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Tap the <Share2 className="inline h-3.5 w-3.5 mx-0.5 text-foreground" /> (Share) icon at the bottom of the screen.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        3
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Scroll down and tap <PlusSquare className="inline h-3.5 w-3.5 mx-0.5 text-foreground" /> <strong>&ldquo;Add to Home Screen&rdquo;</strong>, then tap <strong>Add</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {selectedPlatform === 'desktop' && (
                  <div className="space-y-2.5 bg-muted/40 p-4 rounded-xl border">
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        1
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Click the <Download className="inline h-3.5 w-3.5 mx-0.5 text-foreground" /> <strong>Install</strong> icon in the browser address bar.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        2
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Click <strong>Install</strong> to run NisFlow in a clean, standalone desktop window.
                      </p>
                    </div>
                    {isInstallable && (
                      <button
                        onClick={handleInstallClick}
                        className="w-full mt-2 flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl py-2.5 text-xs font-semibold transition-colors"
                      >
                        <Laptop className="h-4 w-4" /> Install Desktop App
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-primary/5 border border-primary/15 rounded-xl px-3 py-2">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span>Runs full-screen with biometric lock, instant launch, and offline ledger support.</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {currentSlide.features?.map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-start gap-3 bg-muted/40 rounded-xl px-4 py-3 border">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background border shadow-2xs">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-xs sm:text-sm leading-snug">{text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t pt-4">
            <button
              onClick={prev}
              disabled={slideIndex === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-0 disabled:pointer-events-none rounded-xl text-sm font-medium transition-all"
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <div className="text-xs text-muted-foreground font-medium">
              {slideIndex + 1} of {totalTourSlides}
            </div>

            <button
              onClick={next}
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-4 sm:px-5 py-2 rounded-xl text-sm font-semibold shadow transition-colors"
            >
              {slideIndex === totalTourSlides - 1 ? (
                <>Set Up Account <CheckCircle2 size={15} /></>
              ) : (
                <>Next <ChevronRight size={15} /></>
              )}
            </button>
          </div>
        </div>

        {/* Small footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          NisFlow Finance · Installable PWA · Bank-grade data privacy
        </p>
      </div>
    </div>
  );
}

