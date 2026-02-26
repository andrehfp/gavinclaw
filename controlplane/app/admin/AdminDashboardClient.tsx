'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  AdminApprovalRequest,
  AdminAuditEvent,
  AdminAuditStatus,
  AdminInvitation,
  AdminMember,
  AdminOverview,
  AdminPolicyRule,
  AdminRole,
} from '@/lib/server/admin/types';
import type { ApprovalStatus } from '@/lib/server/domain/approvals';
import type { PolicyMode } from '@/lib/server/domain/policies';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type InitialAdminContext = {
  orgId: string;
  orgName: string;
  actorEmail: string | null;
  role: AdminRole;
};

type AdminTab = 'overview' | 'members' | 'policies' | 'audit' | 'approvals';

type AuditFilters = {
  action: string;
  actor: string;
  status: '' | AdminAuditStatus;
};

type PolicyDraft = {
  name: string;
  mode: PolicyMode;
  blockedTermsText: string;
  enabled: boolean;
};

const TAB_LABELS: Record<AdminTab, string> = {
  overview: 'Overview',
  members: 'Members',
  policies: 'Policies',
  audit: 'Audit',
  approvals: 'Approvals',
};

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response, 'Request failed'));
  }

  return (await response.json()) as T;
}

function termsToString(terms: string[]): string {
  return terms.join(', ');
}

function stringToTerms(raw: string): string[] {
  return raw
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function formatDate(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }

  return date.toLocaleString();
}

function roleClass(role: AdminRole): string {
  return role === 'admin'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-zinc-100 text-zinc-700 border-zinc-200';
}

export default function AdminDashboardClient({ initialContext }: { initialContext: InitialAdminContext }) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const [members, setMembers] = useState<AdminMember[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('user');
  const [updatingMembershipId, setUpdatingMembershipId] = useState<string | null>(null);

  const [policies, setPolicies] = useState<AdminPolicyRule[]>([]);
  const [policyDraftById, setPolicyDraftById] = useState<Record<string, PolicyDraft>>({});
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [creatingPolicy, setCreatingPolicy] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyMode, setNewPolicyMode] = useState<PolicyMode>('warn');
  const [newPolicyTerms, setNewPolicyTerms] = useState('');
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null);

  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({ action: '', actor: '', status: '' });
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [approvals, setApprovals] = useState<AdminApprovalRequest[]>([]);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'' | ApprovalStatus>('pending');
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [decisionReasonById, setDecisionReasonById] = useState<Record<string, string>>({});
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null);

  const membersByRole = useMemo(() => {
    const admins = members.filter((member) => member.role === 'admin').length;
    const users = members.filter((member) => member.role === 'user').length;
    return { admins, users };
  }, [members]);

  async function loadOverview() {
    setLoadingOverview(true);
    try {
      const payload = await apiRequest<{ overview: AdminOverview }>('/api/protected/admin/overview');
      setOverview(payload.overview);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load overview');
    } finally {
      setLoadingOverview(false);
    }
  }

  async function loadMembers() {
    setLoadingMembers(true);
    try {
      const payload = await apiRequest<{ members: AdminMember[]; invitations: AdminInvitation[] }>(
        '/api/protected/admin/members',
      );
      setMembers(payload.members);
      setInvitations(payload.invitations);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load members');
    } finally {
      setLoadingMembers(false);
    }
  }

  async function loadPolicies() {
    setLoadingPolicies(true);
    try {
      const payload = await apiRequest<{ policies: AdminPolicyRule[] }>('/api/protected/admin/policies');
      setPolicies(payload.policies);
      setPolicyDraftById((previous) => {
        const next: Record<string, PolicyDraft> = {};
        for (const policy of payload.policies) {
          next[policy.id] = previous[policy.id] ?? {
            name: policy.name,
            mode: policy.mode,
            blockedTermsText: termsToString(policy.blockedTerms),
            enabled: policy.enabled,
          };
        }
        return next;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load policies');
    } finally {
      setLoadingPolicies(false);
    }
  }

  async function loadApprovals() {
    setLoadingApprovals(true);
    try {
      const query = new URLSearchParams();
      if (approvalStatusFilter) {
        query.set('status', approvalStatusFilter);
      }

      const payload = await apiRequest<{ approvals: AdminApprovalRequest[] }>(
        `/api/protected/admin/approvals?${query.toString()}`,
      );
      setApprovals(payload.approvals);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load approvals');
    } finally {
      setLoadingApprovals(false);
    }
  }

  async function loadAudit(reset: boolean) {
    setLoadingAudit(true);
    try {
      const query = new URLSearchParams();
      query.set('limit', '40');
      if (!reset && auditNextCursor) {
        query.set('cursor', auditNextCursor);
      }
      if (auditFilters.action.trim().length > 0) {
        query.set('action', auditFilters.action.trim());
      }
      if (auditFilters.actor.trim().length > 0) {
        query.set('actor', auditFilters.actor.trim());
      }
      if (auditFilters.status) {
        query.set('status', auditFilters.status);
      }

      const payload = await apiRequest<{ events: AdminAuditEvent[]; nextCursor: string | null }>(
        `/api/protected/admin/audit?${query.toString()}`,
      );

      setAuditEvents((current) => (reset ? payload.events : [...current, ...payload.events]));
      setAuditNextCursor(payload.nextCursor);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load audit events');
    } finally {
      setLoadingAudit(false);
    }
  }

  async function refreshAll() {
    setErrorMessage(null);
    await Promise.all([loadOverview(), loadMembers(), loadPolicies(), loadApprovals(), loadAudit(true)]);
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalStatusFilter]);

  async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    try {
      await apiRequest<{ invitation: AdminInvitation }>('/api/protected/admin/members/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      setInviteEmail('');
      setInviteRole('user');
      await loadMembers();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not send invitation');
    }
  }

  async function handleRoleUpdate(member: AdminMember, role: AdminRole) {
    setUpdatingMembershipId(member.membershipId);
    setErrorMessage(null);
    try {
      await apiRequest<{ member: AdminMember }>(`/api/protected/admin/members/${encodeURIComponent(member.membershipId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await loadMembers();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update member role');
    } finally {
      setUpdatingMembershipId(null);
    }
  }

  async function handleMemberDelete(member: AdminMember) {
    const confirmed = window.confirm(`Remove ${member.email ?? member.userId} from this organization?`);
    if (!confirmed) {
      return;
    }

    setUpdatingMembershipId(member.membershipId);
    setErrorMessage(null);
    try {
      await apiRequest<{ ok: true }>(`/api/protected/admin/members/${encodeURIComponent(member.membershipId)}`, {
        method: 'DELETE',
      });
      await loadMembers();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete member');
    } finally {
      setUpdatingMembershipId(null);
    }
  }

  async function handleCreatePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingPolicy(true);
    setErrorMessage(null);

    try {
      await apiRequest<{ policy: AdminPolicyRule }>('/api/protected/admin/policies', {
        method: 'POST',
        body: JSON.stringify({
          name: newPolicyName,
          mode: newPolicyMode,
          enabled: true,
          blockedTerms: stringToTerms(newPolicyTerms),
        }),
      });
      setNewPolicyName('');
      setNewPolicyMode('warn');
      setNewPolicyTerms('');
      await loadPolicies();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create policy');
    } finally {
      setCreatingPolicy(false);
    }
  }

  async function handleSavePolicy(policyId: string) {
    const draft = policyDraftById[policyId];
    if (!draft) {
      return;
    }

    setSavingPolicyId(policyId);
    setErrorMessage(null);
    try {
      await apiRequest<{ policy: AdminPolicyRule }>(`/api/protected/admin/policies/${encodeURIComponent(policyId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          mode: draft.mode,
          enabled: draft.enabled,
          blockedTerms: stringToTerms(draft.blockedTermsText),
        }),
      });

      await loadPolicies();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save policy');
    } finally {
      setSavingPolicyId(null);
    }
  }

  async function handleTogglePolicy(policy: AdminPolicyRule, enabled: boolean) {
    setSavingPolicyId(policy.id);
    setErrorMessage(null);
    try {
      await apiRequest<{ policy: AdminPolicyRule }>(
        `/api/protected/admin/policies/${encodeURIComponent(policy.id)}/toggle`,
        {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        },
      );
      await loadPolicies();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not toggle policy');
    } finally {
      setSavingPolicyId(null);
    }
  }

  async function handleDeletePolicy(policyId: string) {
    const confirmed = window.confirm('Delete this policy permanently?');
    if (!confirmed) {
      return;
    }

    setSavingPolicyId(policyId);
    setErrorMessage(null);
    try {
      await apiRequest<{ ok: true }>(`/api/protected/admin/policies/${encodeURIComponent(policyId)}`, {
        method: 'DELETE',
      });
      await loadPolicies();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete policy');
    } finally {
      setSavingPolicyId(null);
    }
  }

  async function handleApprovalDecision(requestId: string, decision: 'approved' | 'rejected') {
    setDecidingRequestId(requestId);
    setErrorMessage(null);
    try {
      await apiRequest<{ approval: AdminApprovalRequest }>(
        `/api/protected/admin/approvals/${encodeURIComponent(requestId)}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            justification: decisionReasonById[requestId]?.trim() || undefined,
          }),
        },
      );
      await loadApprovals();
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not decide approval request');
    } finally {
      setDecidingRequestId(null);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500">Admin Dashboard</p>
            <h1 className="text-2xl font-semibold">{initialContext.orgName}</h1>
            <p className="text-sm text-zinc-500">
              Org: <span className="font-mono">{initialContext.orgId}</span> · Signed in as {initialContext.actorEmail ?? 'admin'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${roleClass(initialContext.role)} border`}>{initialContext.role}</Badge>
            <Button asChild size="sm" variant="outline">
              <Link href="/">Back to workspace</Link>
            </Button>
            <Button onClick={() => void refreshAll()} size="sm" type="button" variant="default">
              Refresh
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(Object.keys(TAB_LABELS) as AdminTab[]).map((tabKey) => (
            <Button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              size="sm"
              type="button"
              variant={tab === tabKey ? 'default' : 'outline'}
            >
              {TAB_LABELS[tabKey]}
            </Button>
          ))}
        </div>

        {tab === 'overview' ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {loadingOverview || !overview
              ? [1, 2, 3, 4].map((key) => (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4" key={key}>
                    <div className="h-4 w-20 animate-pulse rounded bg-zinc-200" />
                    <div className="mt-3 h-8 w-12 animate-pulse rounded bg-zinc-200" />
                  </div>
                ))
              : [
                  ['Members', overview.membersTotal],
                  ['Admins', overview.adminsTotal],
                  ['Users', overview.usersTotal],
                  ['Conversations', overview.conversationsTotal],
                  ['Messages', overview.messagesTotal],
                  ['Pending approvals', overview.pendingApprovals],
                  ['Active policies', overview.activePolicies],
                  ['Audit events (24h)', overview.recentAuditCount24h],
                ].map(([label, value]) => (
                  <div className="rounded-lg border border-zinc-200 bg-white p-4" key={label}>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
          </section>
        ) : null}

        {tab === 'members' ? (
          <section className="space-y-4">
            <form className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-[1fr_140px_auto]" onSubmit={handleInviteSubmit}>
              <Input
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="Invite by email"
                required
                type="email"
                value={inviteEmail}
              />
              <select
                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                onChange={(event) => setInviteRole(event.target.value as AdminRole)}
                value={inviteRole}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <Button disabled={loadingMembers} type="submit">
                Send invite
              </Button>
            </form>

            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
                <h2 className="text-sm font-semibold">Organization members</h2>
                <p className="text-xs text-zinc-500">
                  {members.length} total · {membersByRole.admins} admins · {membersByRole.users} users
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-zinc-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">User</th>
                      <th className="px-4 py-2 font-medium">Role</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Updated</th>
                      <th className="px-4 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMembers ? (
                      <tr>
                        <td className="px-4 py-3 text-zinc-500" colSpan={5}>Loading members…</td>
                      </tr>
                    ) : members.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-zinc-500" colSpan={5}>No members found.</td>
                      </tr>
                    ) : (
                      members.map((member) => (
                        <tr className="border-t border-zinc-100" key={member.membershipId}>
                          <td className="px-4 py-2">
                            <p className="font-medium">{member.email ?? member.userId}</p>
                            <p className="text-xs text-zinc-500">{member.name ?? member.userId}</p>
                          </td>
                          <td className="px-4 py-2">
                            <Badge className={`${roleClass(member.role)} border`}>{member.role}</Badge>
                          </td>
                          <td className="px-4 py-2">
                            <span className="capitalize text-zinc-600">{member.status}</span>
                          </td>
                          <td className="px-4 py-2 text-zinc-600">{formatDate(member.updatedAt)}</td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={updatingMembershipId === member.membershipId || member.role === 'admin'}
                                onClick={() => void handleRoleUpdate(member, 'admin')}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Make admin
                              </Button>
                              <Button
                                disabled={updatingMembershipId === member.membershipId || member.role === 'user'}
                                onClick={() => void handleRoleUpdate(member, 'user')}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Make user
                              </Button>
                              <Button
                                disabled={updatingMembershipId === member.membershipId}
                                onClick={() => void handleMemberDelete(member)}
                                size="sm"
                                type="button"
                                variant="destructive"
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h3 className="text-sm font-semibold">Pending invitations</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-zinc-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-4 py-2 font-medium">Role</th>
                      <th className="px-4 py-2 font-medium">Expires</th>
                      <th className="px-4 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-zinc-500" colSpan={4}>No pending invitations.</td>
                      </tr>
                    ) : (
                      invitations.map((invitation) => (
                        <tr className="border-t border-zinc-100" key={invitation.invitationId}>
                          <td className="px-4 py-2">{invitation.email}</td>
                          <td className="px-4 py-2">{invitation.role ?? '—'}</td>
                          <td className="px-4 py-2 text-zinc-600">{formatDate(invitation.expiresAt)}</td>
                          <td className="px-4 py-2 text-zinc-600">{formatDate(invitation.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'policies' ? (
          <section className="space-y-4">
            <form className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4" onSubmit={handleCreatePolicy}>
              <p className="text-sm font-semibold">Create policy</p>
              <Input
                onChange={(event) => setNewPolicyName(event.target.value)}
                placeholder="Policy name"
                required
                value={newPolicyName}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  onChange={(event) => setNewPolicyMode(event.target.value as PolicyMode)}
                  value={newPolicyMode}
                >
                  <option value="allow">allow</option>
                  <option value="warn">warn</option>
                  <option value="redact">redact</option>
                  <option value="block">block</option>
                </select>
                <Input
                  onChange={(event) => setNewPolicyTerms(event.target.value)}
                  placeholder="blocked terms (comma-separated)"
                  value={newPolicyTerms}
                />
              </div>
              <Button disabled={creatingPolicy} type="submit">Create policy</Button>
            </form>

            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h2 className="text-sm font-semibold">Policies</h2>
              </div>
              <div className="space-y-3 p-4">
                {loadingPolicies ? <p className="text-sm text-zinc-500">Loading policies…</p> : null}
                {!loadingPolicies && policies.length === 0 ? <p className="text-sm text-zinc-500">No policy rules found.</p> : null}
                {policies.map((policy) => {
                  const draft = policyDraftById[policy.id] ?? {
                    name: policy.name,
                    mode: policy.mode,
                    blockedTermsText: termsToString(policy.blockedTerms),
                    enabled: policy.enabled,
                  };

                  return (
                    <div className="rounded-md border border-zinc-200 p-3" key={policy.id}>
                      <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                        <Input
                          onChange={(event) => {
                            setPolicyDraftById((current) => ({
                              ...current,
                              [policy.id]: {
                                ...draft,
                                name: event.target.value,
                              },
                            }));
                          }}
                          value={draft.name}
                        />
                        <select
                          className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                          onChange={(event) => {
                            setPolicyDraftById((current) => ({
                              ...current,
                              [policy.id]: {
                                ...draft,
                                mode: event.target.value as PolicyMode,
                              },
                            }));
                          }}
                          value={draft.mode}
                        >
                          <option value="allow">allow</option>
                          <option value="warn">warn</option>
                          <option value="redact">redact</option>
                          <option value="block">block</option>
                        </select>
                      </div>
                      <Textarea
                        className="mt-3"
                        onChange={(event) => {
                          setPolicyDraftById((current) => ({
                            ...current,
                            [policy.id]: {
                              ...draft,
                              blockedTermsText: event.target.value,
                            },
                          }));
                        }}
                        placeholder="blocked terms (comma-separated)"
                        rows={2}
                        value={draft.blockedTermsText}
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge className={policy.enabled ? 'border border-emerald-200 bg-emerald-100 text-emerald-800' : 'border border-zinc-200 bg-zinc-100 text-zinc-700'}>
                          {policy.enabled ? 'enabled' : 'disabled'}
                        </Badge>
                        <Button
                          disabled={savingPolicyId === policy.id}
                          onClick={() => void handleSavePolicy(policy.id)}
                          size="sm"
                          type="button"
                          variant="default"
                        >
                          Save
                        </Button>
                        <Button
                          disabled={savingPolicyId === policy.id}
                          onClick={() => void handleTogglePolicy(policy, !policy.enabled)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {policy.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          disabled={savingPolicyId === policy.id}
                          onClick={() => void handleDeletePolicy(policy.id)}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'audit' ? (
          <section className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-[1fr_1fr_180px_auto]">
              <Input
                onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value }))}
                placeholder="Filter by action"
                value={auditFilters.action}
              />
              <Input
                onChange={(event) => setAuditFilters((current) => ({ ...current, actor: event.target.value }))}
                placeholder="Filter by actor id"
                value={auditFilters.actor}
              />
              <select
                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                onChange={(event) => {
                  const value = event.target.value;
                  setAuditFilters((current) => ({
                    ...current,
                    status: value === 'success' || value === 'denied' || value === 'failed' ? value : '',
                  }));
                }}
                value={auditFilters.status}
              >
                <option value="">all status</option>
                <option value="success">success</option>
                <option value="denied">denied</option>
                <option value="failed">failed</option>
              </select>
              <Button onClick={() => void loadAudit(true)} size="sm" type="button">Apply filters</Button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-zinc-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Time</th>
                      <th className="px-4 py-2 font-medium">Action</th>
                      <th className="px-4 py-2 font-medium">Actor</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Resource</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAudit && auditEvents.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-zinc-500" colSpan={5}>Loading audit events…</td>
                      </tr>
                    ) : auditEvents.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-zinc-500" colSpan={5}>No audit events found.</td>
                      </tr>
                    ) : (
                      auditEvents.map((event) => (
                        <tr className="border-t border-zinc-100" key={event.id}>
                          <td className="px-4 py-2 text-zinc-600">{formatDate(event.ts)}</td>
                          <td className="px-4 py-2 font-medium">{event.action}</td>
                          <td className="px-4 py-2 text-zinc-600">{event.actorId}</td>
                          <td className="px-4 py-2">
                            <Badge
                              className={
                                event.status === 'success'
                                  ? 'border border-emerald-200 bg-emerald-100 text-emerald-800'
                                  : event.status === 'denied'
                                    ? 'border border-amber-200 bg-amber-100 text-amber-800'
                                    : 'border border-rose-200 bg-rose-100 text-rose-700'
                              }
                            >
                              {event.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-zinc-600">{event.resource}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end border-t border-zinc-200 px-4 py-3">
                <Button
                  disabled={!auditNextCursor || loadingAudit}
                  onClick={() => void loadAudit(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {loadingAudit ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'approvals' ? (
          <section className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
              <select
                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                onChange={(event) => {
                  const value = event.target.value;
                  setApprovalStatusFilter(value === 'pending' || value === 'approved' || value === 'rejected' ? value : '');
                }}
                value={approvalStatusFilter}
              >
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="">all</option>
              </select>
              <Button onClick={() => void loadApprovals()} size="sm" type="button" variant="outline">
                Refresh approvals
              </Button>
            </div>

            <div className="space-y-3">
              {loadingApprovals ? <p className="text-sm text-zinc-500">Loading approvals…</p> : null}
              {!loadingApprovals && approvals.length === 0 ? <p className="text-sm text-zinc-500">No approval requests found.</p> : null}

              {approvals.map((approval) => (
                <div className="rounded-lg border border-zinc-200 bg-white p-4" key={approval.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{approval.action}</p>
                      <p className="text-sm text-zinc-500">{approval.resource}</p>
                    </div>
                    <Badge
                      className={
                        approval.status === 'approved'
                          ? 'border border-emerald-200 bg-emerald-100 text-emerald-800'
                          : approval.status === 'rejected'
                            ? 'border border-rose-200 bg-rose-100 text-rose-700'
                            : 'border border-amber-200 bg-amber-100 text-amber-800'
                      }
                    >
                      {approval.status}
                    </Badge>
                  </div>

                  <div className="mt-2 text-sm text-zinc-600">
                    <p>Requested by: {approval.requestedByUserId}</p>
                    <p>Created: {formatDate(approval.createdAt)}</p>
                    {approval.justification ? <p>Justification: {approval.justification}</p> : null}
                  </div>

                  {approval.status === 'pending' ? (
                    <div className="mt-3 space-y-2">
                      <Input
                        onChange={(event) => {
                          setDecisionReasonById((current) => ({
                            ...current,
                            [approval.id]: event.target.value,
                          }));
                        }}
                        placeholder="Optional decision reason"
                        value={decisionReasonById[approval.id] ?? ''}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={decidingRequestId === approval.id}
                          onClick={() => void handleApprovalDecision(approval.id, 'approved')}
                          size="sm"
                          type="button"
                          variant="default"
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={decidingRequestId === approval.id}
                          onClick={() => void handleApprovalDecision(approval.id, 'rejected')}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
