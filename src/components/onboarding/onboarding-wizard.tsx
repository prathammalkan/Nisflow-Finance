'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Wallet, Tags, Upload, CheckCircle2, ArrowRight } from 'lucide-react';
import { AccountForm } from '@/components/accounts/account-form';
import { useAccounts } from '@/lib/hooks/use-accounts';

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);

  const totalSteps = 5;

  const nextStep = () => setStep(prev => Math.min(prev + 1, totalSteps));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));
  const skipStep = () => nextStep();
  
  const finishOnboarding = () => {
    // We could update a user profile flag here if we had one.
    // For now, reloading or dismissing is enough.
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl p-4">
        <div className="mb-8 flex justify-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-12 rounded-full ${i + 1 <= step ? 'bg-primary' : 'bg-primary/20'}`}
            />
          ))}
        </div>

        <Card className="border-2 shadow-xl">
          {step === 1 && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-3xl">Welcome to NisFlow Finance</CardTitle>
                <CardDescription className="text-base mt-2">
                  Your complete personal finance command center. Let's get you set up so you can start tracking your wealth immediately.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center pt-6 pb-8">
                <p className="text-muted-foreground">
                  In the next few steps, we'll configure your accounts, categories, and initial data. 
                  You can skip any step and configure it later.
                </p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" onClick={skipStep}>Skip Onboarding</Button>
                <Button onClick={nextStep}>Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </CardFooter>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Wallet className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Set up your accounts</CardTitle>
                    <CardDescription>Add your main bank account or wallet to start tracking balances.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-medium mb-2">Accounts added: {accounts?.length || 0}</h4>
                  {accounts && accounts.length > 0 ? (
                    <ul className="space-y-2 mb-4">
                      {accounts.map(acc => (
                        <li key={acc.id} className="text-sm flex justify-between">
                          <span>{acc.name}</span>
                          <span className="font-medium">₹{acc.balance}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">No accounts added yet.</p>
                  )}
                  <Button variant="outline" onClick={() => setIsAccountFormOpen(true)} className="w-full">
                    + Add an Account
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" onClick={prevStep}>Back</Button>
                <div className="space-x-2">
                  <Button variant="ghost" onClick={skipStep}>Skip</Button>
                  <Button onClick={nextStep} disabled={!accounts || accounts.length === 0}>Next Step</Button>
                </div>
              </CardFooter>
              <AccountForm open={isAccountFormOpen} onOpenChange={setIsAccountFormOpen} />
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Tags className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Review Categories</CardTitle>
                    <CardDescription>We've pre-configured some standard categories for your transactions.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {['Food & Dining', 'Transportation', 'Housing', 'Utilities', 'Salary', 'Investment'].map(cat => (
                    <div key={cat} className="flex items-center justify-center rounded-md border p-2 text-sm bg-background">
                      {cat}
                    </div>
                  ))}
                  <div className="flex items-center justify-center rounded-md border border-dashed p-2 text-sm text-muted-foreground">
                    + More in Settings
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" onClick={prevStep}>Back</Button>
                <div className="space-x-2">
                  <Button variant="ghost" onClick={skipStep}>Skip</Button>
                  <Button onClick={nextStep}>Next Step</Button>
                </div>
              </CardFooter>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Import Data</CardTitle>
                    <CardDescription>Do you have existing data to import?</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 cursor-pointer hover:border-primary transition-colors">
                    <h4 className="font-medium mb-1">Import Statement</h4>
                    <p className="text-sm text-muted-foreground">Upload a CSV from your bank to automatically add past transactions.</p>
                  </div>
                  <div className="rounded-lg border p-4 cursor-pointer hover:border-primary transition-colors bg-primary/5 border-primary">
                    <h4 className="font-medium mb-1">Start Fresh</h4>
                    <p className="text-sm text-muted-foreground">Add transactions manually as they happen.</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="ghost" onClick={prevStep}>Back</Button>
                <div className="space-x-2">
                  <Button variant="ghost" onClick={skipStep}>Skip</Button>
                  <Button onClick={nextStep}>Next Step</Button>
                </div>
              </CardFooter>
            </>
          )}

          {step === 5 && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <CardTitle className="text-3xl">All Set!</CardTitle>
                <CardDescription className="text-base mt-2">
                  Your financial command center is ready. Start tracking, analyzing, and growing your wealth.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex justify-center pt-8">
                <Button size="lg" onClick={finishOnboarding}>
                  Go to Dashboard
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
