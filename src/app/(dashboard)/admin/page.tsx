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
  useGrantAdminRole,
  useRevokeAdminRole,
  useAdminAuditLog,
  type UserListEntry,
  type AuditLogEntry,
} from '@/lib/hooks/use-admin';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Users,
  UserCheck,
  UserX,
  Settings,
  Loader2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  ScrollText,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string) {
  if (status === 'approved') return <Badge variant="default">approved</Badge>;
  if (status === 'suspended') return <Badge variant="destructive">suspended</Badge>;
  return <Badge variant="secondary">pending</Badge>;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    USER_APPROVED: 'User approved',
    USER_SUSPENDED: 'User suspended',
    USER_REACTIVATED: 'User reactivated',
    REGISTRATION_MODE_CHANGED: 'Registration mode changed',
    ADMIN_GRANTED: 'Admin granted',
    ADMIN_REVOKED: 'Admin revoked',
  };
  return map[action] ?? action;
}

function shortId(id: string | null) {
  if (!id) return '—';
  return id.substring(0, 8) + '…';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BootstrapView({ onBootstrap, isPending }: { onBootstrap: () => void; isPending: boolean }) {
  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-6">
      <ShieldAlert className="h-16 w-16 mx-auto text-amber-500" />
      <h1 className="text-2xl font-bold">System Setup Required</h1>
      <p className="text-muted-foreground">
        No administrator has been configured yet. The first user to claim this role becomes
        the system administrator. You must be authenticated and approved to proceed.
      </p>
      <Button size="lg" onClick={onBootstrap} disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <ShieldCheck className="mr-2 h-4 w-4" />
        Become Administrator
      </Button>
    </div>
  );
}

function AccessDeniedView() {
  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-4">
      <ShieldX className="h-16 w-16 mx-auto text-muted-foreground" />
      <h1 className="text-2xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground">
        This page is restricted to system administrators.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Row
// ---------------------------------------------------------------------------

interface UserRowProps {
  user: UserListEntry;
  currentUserId?: string;
  onApprove: (id: string) => void;
  onSuspend: (id: string, reason: string) => void;
  onReactivate: (id: string) => void;
  onGrantAdmin: (id: string) => void;
  onRevokeAdmin: (id: string) => void;
  isApprovePending: boolean;
  isSuspendPending: boolean;
  isReactivatePending: boolean;
  isGrantPending: boolean;
  isRevokePending: boolean;
}

function UserRow({
  user,
  currentUserId,
  onApprove,
  onSuspend,
  onReactivate,
  onGrantAdmin,
  onRevokeAdmin,
  isApprovePending,
  isSuspendPending,
  isReactivatePending,
  isGrantPending,
  isRevokePending,
}: UserRowProps) {
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const isSelf = currentUserId === user.user_id;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-md">
      {/* Identity */}
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate max-w-[200px]">
            {user.email ?? <code className="text-xs">{shortId(user.user_id)}</code>}
          </p>
          <p className="text-xs text-muted-foreground">
            Joined {new Date(user.created_at).toLocaleDateString()}
            {isSelf && <span className="ml-2 text-primary font-medium">(you)</span>}
          </p>
        </div>
        {statusBadge(user.status)}
        {user.is_admin && (
          <Badge variant="outline" className="border-primary text-primary gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Approve pending */}
        {user.status === 'pending' && (
          <Button size="sm" onClick={() => onApprove(user.user_id)} disabled={isApprovePending}>
            <UserCheck className="mr-1 h-3 w-3" />
            Approve
          </Button>
        )}

        {/* Suspend approved non-admin */}
        {user.status === 'approved' && !user.is_admin && (
          suspending ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs border rounded px-2 py-1 w-36 bg-background"
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onSuspend(user.user_id, reason);
                  setSuspending(false);
                  setReason('');
                }}
                disabled={isSuspendPending}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSuspending(false); setReason(''); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSuspending(true)}>
              <AlertTriangle className="mr-1 h-3 w-3" />
              Suspend
            </Button>
          )
        )}

        {/* Reactivate suspended */}
        {user.status === 'suspended' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReactivate(user.user_id)}
            disabled={isReactivatePending}
          >
            Reactivate
          </Button>
        )}

        {/* Grant admin (approved, non-admin) */}
        {user.status === 'approved' && !user.is_admin && (
          <Button
            size="sm"
            variant="outline"
            className="border-primary text-primary hover:bg-primary/10"
            onClick={() => onGrantAdmin(user.user_id)}
            disabled={isGrantPending}
          >
            <ShieldCheck className="mr-1 h-3 w-3" />
            Make Admin
          </Button>
        )}

        {/* Revoke admin (admin, not self) */}
        {user.is_admin && !isSelf && (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => onRevokeAdmin(user.user_id)}
            disabled={isRevokePending}
          >
            <ShieldX className="mr-1 h-3 w-3" />
            Revoke Admin
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

function AuditLogSection({ entries, isLoading }: { entries?: AuditLogEntry[]; isLoading: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="border rounded-lg p-6 space-y-4">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Admin Audit Log</h2>
          {entries && <Badge variant="secondary">{entries.length}</Badge>}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !entries?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Time</th>
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 pr-4 font-medium">Actor</th>
                  <th className="pb-2 font-medium">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(entry.logged_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-medium">{actionLabel(entry.action)}</td>
                    <td className="py-2 pr-4 text-muted-foreground truncate max-w-[140px]">
                      {entry.actor_email ?? shortId(entry.actor_user_id)}
                    </td>
                    <td className="py-2 text-muted-foreground truncate max-w-[140px]">
                      {entry.target_email ?? shortId(entry.target_user_id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { data: accessStatus, isLoading: statusLoading } = useAccessStatus();
  const { data: adminExists, isLoading: adminExistsLoading } = useAdminExists();
  const { data: userList, isLoading: usersLoading } = useAdminUserList();
  const { data: regMode, isLoading: regModeLoading } = useRegistrationMode();
  const { data: auditLog, isLoading: auditLoading } = useAdminAuditLog(100);

  const approveUser = useApproveUser();
  const suspendUser = useSuspendUser();
  const reactivateUser = useReactivateUser();
  const setRegMode = useSetRegistrationMode();
  const bootstrapAdmin = useBootstrapAdmin();
  const grantAdmin = useGrantAdminRole();
  const revokeAdmin = useRevokeAdminRole();

  // Current user ID (from access status context — we derive it from the user list)
  // We identify "self" by cross-referencing with the admin flag on the access status response.
  // The server layout already guarantees we are admin by this point.
  const currentAdminEntry = userList?.find((u) => u.is_admin && accessStatus?.is_admin);

  // Loading states
  if (statusLoading || adminExistsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Bootstrap flow
  if (!adminExists) {
    return (
      <BootstrapView
        onBootstrap={() => bootstrapAdmin.mutate()}
        isPending={bootstrapAdmin.isPending}
      />
    );
  }

  // Non-admin (client-side defence-in-depth — server layout redirects first)
  if (!accessStatus?.is_admin) {
    return <AccessDeniedView />;
  }

  const pendingUsers = userList?.filter((u) => u.status === 'pending') ?? [];

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            Manage users, registration, access control, and admin roles
          </p>
        </div>
      </div>

      {/* Registration Mode */}
      <section className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Registration Mode</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant={regMode === 'public' ? 'default' : 'secondary'}>
            {regModeLoading ? '…' : regMode === 'public' ? 'Public Registration' : 'Approval Required'}
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
            : 'New users must be approved by an admin before accessing the app. Pending users see a waiting screen.'}
        </p>
      </section>

      {/* Pending Approvals — highlighted section */}
      {pendingUsers.length > 0 && (
        <section className="border border-amber-200 dark:border-amber-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">
              Pending Approval
              <Badge variant="secondary" className="ml-2">{pendingUsers.length}</Badge>
            </h2>
          </div>
          <div className="space-y-3">
            {pendingUsers.map((user) => (
              <div key={user.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/50 rounded-md">
                <div>
                  <p className="text-sm font-medium">
                    {user.email ?? <code className="text-xs">{shortId(user.user_id)}</code>}
                  </p>
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
                    onClick={() => suspendUser.mutate({ userId: user.user_id, reason: 'Rejected during review' })}
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
          <h2 className="text-lg font-semibold">
            All Users
            <Badge variant="secondary" className="ml-2">{userList?.length ?? 0}</Badge>
          </h2>
        </div>

        {usersLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !userList?.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">No users found.</p>
        ) : (
          <div className="space-y-2">
            {userList.map((user) => (
              <UserRow
                key={user.user_id}
                user={user}
                currentUserId={currentAdminEntry?.user_id}
                onApprove={(id) => approveUser.mutate(id)}
                onSuspend={(id, reason) => suspendUser.mutate({ userId: id, reason })}
                onReactivate={(id) => reactivateUser.mutate(id)}
                onGrantAdmin={(id) => grantAdmin.mutate(id)}
                onRevokeAdmin={(id) => revokeAdmin.mutate(id)}
                isApprovePending={approveUser.isPending}
                isSuspendPending={suspendUser.isPending}
                isReactivatePending={reactivateUser.isPending}
                isGrantPending={grantAdmin.isPending}
                isRevokePending={revokeAdmin.isPending}
              />
            ))}
          </div>
        )}
      </section>

      {/* Audit Log */}
      <AuditLogSection entries={auditLog} isLoading={auditLoading} />
    </div>
  );
}
