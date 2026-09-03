'use client';

import { Clock, ShieldX, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useAccessStatus } from '@/lib/hooks/use-admin';

/**
 * Displayed when a user's access status is 'pending'.
 * Blocks access to all financial features until approved by admin.
 */
export function PendingApprovalScreen() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-md text-center space-y-6 p-8">
        <Clock className="h-16 w-16 mx-auto text-amber-500" />
        <h1 className="text-2xl font-bold">Account Pending Approval</h1>
        <p className="text-muted-foreground">
          Your account has been registered successfully. An administrator will review
          and approve your access shortly. You will be able to use NisFlow Finance
          once your account is approved.
        </p>
        <div className="pt-4">
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Displayed when a user's access status is 'suspended'.
 * Blocks access to all financial features.
 */
export function SuspendedAccountScreen() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="max-w-md text-center space-y-6 p-8">
        <ShieldX className="h-16 w-16 mx-auto text-destructive" />
        <h1 className="text-2xl font-bold">Account Suspended</h1>
        <p className="text-muted-foreground">
          Your account has been suspended by an administrator.
          If you believe this is an error, please contact the system administrator.
        </p>
        <div className="pt-4">
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper component that checks access status and gates accordingly.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { data: accessStatus, isLoading } = useAccessStatus();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessStatus?.status === 'pending') {
    return <PendingApprovalScreen />;
  }

  if (accessStatus?.status === 'suspended') {
    return <SuspendedAccountScreen />;
  }

  return <>{children}</>;
}
