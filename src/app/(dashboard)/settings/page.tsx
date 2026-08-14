'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useMonthlyClosings, useCloseMonth, useReopenMonth } from '@/lib/hooks/use-monthly-closing';
import { exportFullUserBackupJSON, exportFullUserBackupSQL } from '@/lib/export-backup';
import { useBiometricLock } from '@/lib/hooks/use-biometric-lock';
import { useWebNotifications } from '@/lib/hooks/use-web-notifications';
import { useProfile, useUpdateProfile } from '@/lib/hooks/use-profile';
import { Download, Database, Fingerprint, Bell, Shield, Lock, FileCode, CheckCircle2, User, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { mutateAsync: updateProfile, isPending: isUpdatingProfile } = useUpdateProfile();
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [hasInitializedName, setHasInitializedName] = useState(false);

  if (profile && !hasInitializedName) {
    setDisplayNameInput(profile.displayName);
    setHasInitializedName(true);
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayNameInput.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }
    await updateProfile({ displayName: displayNameInput.trim() });
  };
  
  const { data: closings } = useMonthlyClosings();
  const { mutateAsync: closeMonth, isPending: isClosing } = useCloseMonth();
  const { mutateAsync: reopenMonth, isPending: isReopening } = useReopenMonth();

  const { isSupported: isBioSupported, isEnabled: isBioEnabled, enableBiometrics, disableBiometrics, lockApp } = useBiometricLock();
  const { isSupported: isWebNotifSupported, permission: webNotifPermission, requestPermission: requestWebNotif, sendNotification, checkPendingAlertsAndNotify } = useWebNotifications();

  const [reopenReason, setReopenReason] = useState('');
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(null);

  const isCurrentMonthClosed = closings?.some(
    (c: any) => c.month === currentMonth && c.year === currentYear && c.status === 'closed'
  );

  const checks = [
    { id: 'recon', label: 'All bank accounts reconciled' },
    { id: 'cash', label: 'Petty cash verified' },
    { id: 'upi', label: 'UPI transactions verified' },
    { id: 'thirdparty', label: 'Third-party accounts checked' },
    { id: 'receivables', label: 'Accounts receivable verified' },
    { id: 'payables', label: 'Accounts payable verified' },
    { id: 'investments', label: 'Investments updated to current value' },
    { id: 'docs', label: 'All necessary documents attached' },
    { id: 'unknown', label: 'All unknown transactions resolved' },
  ];

  const [completedChecks, setCompletedChecks] = useState<Record<string, boolean>>({});

  const allChecksPassed = checks.every(check => completedChecks[check.id]);

  const toggleCheck = (id: string) => {
    setCompletedChecks(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleCloseMonth = async () => {
    if (!allChecksPassed) {
      toast.error('Please complete all checklist items first');
      return;
    }

    try {
      await closeMonth({
        month: currentMonth,
        year: currentYear,
        status: 'closed',
        closed_by: 'system',
        checklist_data: completedChecks
      });
      toast.success('Month closed successfully');
    } catch (error) {
      toast.error('Failed to close month');
    }
  };

  const handleReopen = async (id: string, month: number, year: number) => {
    if (!reopenReason) {
      toast.error('Please provide a reason for reopening');
      return;
    }

    try {
      await reopenMonth({ id, reason: reopenReason, month, year });
      toast.success('Month reopened successfully');
      setReopenReason('');
      setSelectedClosingId(null);
    } catch (error) {
      toast.error('Failed to reopen month');
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings & Security</h1>
        <p className="text-muted-foreground mt-1">Manage profile, hardware protection, backups, device notifications, and month-end closing.</p>
      </div>

      {/* 0. Profile Settings (Synced with Supabase) */}
      <section className="bg-card text-card-foreground p-6 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">User Profile & Account</h2>
            <p className="text-sm text-muted-foreground">Synchronized with Supabase Auth and User Database.</p>
          </div>
        </div>

        {isProfileLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading user profile...
          </div>
        ) : (
          <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Email Address</label>
              <Input value={profile?.email || ""} disabled className="bg-muted text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Managed by Supabase Authentication</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Display Name</label>
              <Input
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="Your Full Name"
                disabled={isUpdatingProfile}
              />
            </div>

            <Button type="submit" disabled={isUpdatingProfile} className="gap-2">
              {isUpdatingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
              {isUpdatingProfile ? "Saving..." : "Save Profile Changes"}
            </Button>
          </form>
        )}
      </section>

      {/* 1. Offline Backups & Data Export */}
      <section className="bg-card text-card-foreground p-6 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">One-Click Data & Database Backups</h2>
            <p className="text-sm text-muted-foreground">Download complete offline dumps of all your financial ledgers and accounts.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2 font-medium">
              <Download className="h-4 w-4 text-emerald-500" />
              Full JSON Backup
            </div>
            <p className="text-xs text-muted-foreground">
              Exports all accounts, transactions, investments, counterparties, rules, and savings goals in structured JSON.
            </p>
            <Button variant="default" className="w-full gap-2" onClick={exportFullUserBackupJSON}>
              <Download className="h-4 w-4" /> Download JSON Dump
            </Button>
          </div>

          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2 font-medium">
              <FileCode className="h-4 w-4 text-blue-500" />
              SQL Database Dump
            </div>
            <p className="text-xs text-muted-foreground">
              Exports executable PostgreSQL SQL `INSERT INTO` statements to restore data into any database.
            </p>
            <Button variant="outline" className="w-full gap-2" onClick={exportFullUserBackupSQL}>
              <FileCode className="h-4 w-4" /> Download SQL Dump
            </Button>
          </div>
        </div>
      </section>

      {/* 2. Biometric App Lock */}
      <section className="bg-card text-card-foreground p-6 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Biometric App Lock</h2>
            <p className="text-sm text-muted-foreground">Hardware protection using Touch ID, Face ID, or Device Fingerprint.</p>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-medium">
                Hardware Biometric Authentication
                {isBioEnabled ? (
                  <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isBioSupported
                  ? "Require Touch ID / Face ID / Fingerprint verification whenever NisFlow is opened."
                  : "Biometric hardware is not available or supported on this device."}
              </p>
            </div>
            {isBioSupported && (
              <div className="flex items-center gap-2">
                {isBioEnabled ? (
                  <Button variant="destructive" size="sm" onClick={disableBiometrics}>
                    Disable
                  </Button>
                ) : (
                  <Button variant="default" size="sm" onClick={enableBiometrics}>
                    Enable Touch ID / Face ID
                  </Button>
                )}
              </div>
            )}
          </div>

          {isBioEnabled && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={lockApp}>
                <Lock className="h-4 w-4" /> Test Lock App Now
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Device Push Notifications */}
      <section className="bg-card text-card-foreground p-6 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b pb-4">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Device Push Notifications</h2>
            <p className="text-sm text-muted-foreground">Receive native browser and phone alerts for due payables, overdue receivables, and budget warnings.</p>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-medium">
                Push Notification Permission
                <Badge variant={webNotifPermission === 'granted' ? 'default' : 'outline'}>
                  {webNotifPermission}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Allow NisFlow to send push alerts directly to your phone or desktop.
              </p>
            </div>

            <div>
              {webNotifPermission !== 'granted' ? (
                <Button variant="default" size="sm" onClick={requestWebNotif}>
                  Enable Device Notifications
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sendNotification("NisFlow Test Alert", { body: "Device notifications are working perfectly!" })}
                >
                  Test Notification
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Month-end Closing */}
      <section className="bg-card text-card-foreground p-6 rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-semibold">Month-end Closing</h2>
            <p className="text-sm text-muted-foreground">Lock completed months to preserve audit records.</p>
          </div>
        </div>
        
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-medium text-base">Current Period: {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })} {currentYear}</h3>
              <p className="text-xs text-muted-foreground">Status: <span className="font-medium text-foreground">{isCurrentMonthClosed ? 'Closed' : 'Open'}</span></p>
            </div>
            {!isCurrentMonthClosed && (
              <Button 
                onClick={handleCloseMonth} 
                disabled={!allChecksPassed || isClosing}
                className={allChecksPassed ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              >
                {isClosing ? 'Closing...' : 'Close Month'}
              </Button>
            )}
          </div>

          {!isCurrentMonthClosed && (
            <div className="space-y-2 mt-4">
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-2">Closing Checklist</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {checks.map(check => (
                  <div key={check.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      id={check.id}
                      checked={!!completedChecks[check.id]}
                      onChange={() => toggleCheck(check.id)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                    />
                    <label htmlFor={check.id} className="cursor-pointer">{check.label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-medium mb-3 text-sm">Closing History</h3>
          <div className="border rounded-md overflow-hidden">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Period</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Closed Date</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {closings?.map((closing: any) => (
                  <tr key={closing.id}>
                    <td className="px-4 py-3">{new Date(closing.year, closing.month - 1).toLocaleString('default', { month: 'long' })} {closing.year}</td>
                    <td className="px-4 py-3">
                      <Badge variant={closing.status === 'closed' ? 'default' : 'secondary'}>
                        {closing.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(closing.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {closing.status === 'closed' && (
                        selectedClosingId === closing.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <Input 
                              placeholder="Reason..." 
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              className="w-48 h-8 text-xs"
                            />
                            <Button size="sm" onClick={() => handleReopen(closing.id, closing.month, closing.year)} disabled={isReopening}>Confirm</Button>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedClosingId(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setSelectedClosingId(closing.id)}>
                            Reopen
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
