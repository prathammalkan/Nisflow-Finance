'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  useAccessStatus,
  useAdminUserList,
  useApproveUser,
  useSuspendUser,
  useReactivateUser,
  useSetRegistrationMode,
  useRegistrationMode,
  useBootstrapAdmin,
  useAdminExists,
} from '@/lib/hooks/use-admin';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  UserCheck,
  UserX,
  Settings,
  Loader2,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export default function AdminPage() {
  const { data: accessStatus, isLoading: statusLoading } = useAccessStatus();
  const { data: adminExists, isLoading: adminExistsLoading } = useAdminExists();
  const { data: userList, isLoading: usersLoading } = useAdminUserList();
  const { data: regMode, isLoading: regModeLoading } = useRegistrationMode();

  const approveUser = useApproveUser();
  const suspendUser = useSuspendUser();
  const reactivateUser = useReactivateUser();
  const setRegMode = useSetRegistrationMode();
  const bootstrapAdmin = useBootstrapAdmin();

  const [suspendReason, setSuspendReason] = useState('');
  const [suspendingUserId, setSuspendingUserId] = useState<string | null>(null);

  if (statusLoading || adminExistsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Bootstrap flow: No admin exists yet
  if (!adminExists) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-6">
        <ShieldAlert className="h-16 w-16 mx-auto text-amber-500" />
        <h1 className="text-2xl font-bold">System Setup Required</h1>
        <p className="text-muted-foreground">
          No administrator has been configured yet. The first user to claim this role
          becomes the system administrator.
        </p>
        <Button
          size="lg"
          onClick={() => bootstrapAdmin.mutate()}
          disabled={bootstrapAdmin.isPending}
        >
          {bootstrapAdmin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <ShieldCheck className="mr-2 h-4 w-4" />
          Become Administrator
        </Button>
      </div>
    );
  }

  // Non-admin user trying to access
  if (!accessStatus?.is_admin) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <Shield className="h-16 w-16 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">
          This page is restricted to system administrators.
        </p>
      </div>
    );
  }

  const pendingUsers = userList?.filter(u => u.status === 'pending') ?? [];
  const approvedUsers = userList?.filter(u => u.status === 'approved') ?? [];
  const suspendedUsers = userList?.filter(u => u.status === 'suspended') ?? [];

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users, registration, and access control</p>
        </div>
      </div>

      {/* Registration Mode */}
      <section className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Registration Mode</h2>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant={regMode === 'public' ? 'default' : 'secondary'}>
            {regModeLoading ? '...' : regMode === 'public' ? 'Public Registration' : 'Approval Required'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRegMode.mutate(regMode === 'public' ? 'approval_required' : 'public')}
            disabled={setRegMode.isPending}
          >
            {setRegMode.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Switch to {regMode === 'public' ? 'Approval Required' : 'Public'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {regMode === 'public'
            ? 'New users are automatically approved upon registration.'
            : 'New users must be approved by an admin before accessing financial features.'}
        </p>
      </section>

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <section className="border border-amber-200 dark:border-amber-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Pending Approval ({pendingUsers.length})</h2>
          </div>
          <div className="space-y-3">
            {pendingUsers.map(user => (
              <div key={user.user_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                <div>
                  <code className="text-xs">{user.user_id.substring(0, 8)}...</code>
                  <p className="text-xs text-muted-foreground">
                    Registered {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => approveUser.mutate(user.user_id)}
                    disabled={approveUser.isPending}
                  >
                    <UserCheck className="mr-1 h-3 w-3" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => suspendUser.mutate({ userId: user.user_id, reason: 'Rejected' })}
                    disabled={suspendUser.isPending}
                  >
                    <UserX className="mr-1 h-3 w-3" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Users */}
      <section className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="text-lg font-semibold">All Users ({userList?.length ?? 0})</h2>
        </div>
        {usersLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {userList?.map(user => (
              <div key={user.user_id} className="flex items-center justify-between p-3 border rounded-md">
                <div className="flex items-center gap-3">
                  <code className="text-xs font-mono">{user.user_id.substring(0, 8)}...</code>
                  <Badge
                    variant={
                      user.status === 'approved' ? 'default' :
                      user.status === 'pending' ? 'secondary' : 'destructive'
                    }
                  >
                    {user.status}
                  </Badge>
                  {user.is_admin && (
                    <Badge variant="outline" className="border-primary text-primary">
                      <Shield className="mr-1 h-3 w-3" /> Admin
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {user.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approveUser.mutate(user.user_id)}
                      disabled={approveUser.isPending}
                    >
                      Approve
                    </Button>
                  )}
                  {user.status === 'approved' && !user.is_admin && (
                    <>
                      {suspendingUserId === user.user_id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Reason (optional)"
                            value={suspendReason}
                            onChange={e => setSuspendReason(e.target.value)}
                            className="text-xs border rounded px-2 py-1 w-40"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              suspendUser.mutate({ userId: user.user_id, reason: suspendReason });
                              setSuspendingUserId(null);
                              setSuspendReason('');
                            }}
                            disabled={suspendUser.isPending}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setSuspendingUserId(null); setSuspendReason(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSuspendingUserId(user.user_id)}
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Suspend
                        </Button>
                      )}
                    </>
                  )}
                  {user.status === 'suspended' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reactivateUser.mutate(user.user_id)}
                      disabled={reactivateUser.isPending}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
