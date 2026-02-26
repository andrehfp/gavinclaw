import type { Role } from '@/lib/rbac';
import type { ApprovalStatus } from '@/lib/server/domain/approvals';
import type { PolicyMode } from '@/lib/server/domain/policies';

export type AdminRole = Extract<Role, 'admin' | 'user'>;

export type AdminMembershipStatus = 'active' | 'pending' | 'inactive';

export type AdminOverview = {
  membersTotal: number;
  adminsTotal: number;
  usersTotal: number;
  conversationsTotal: number;
  messagesTotal: number;
  pendingApprovals: number;
  activePolicies: number;
  recentAuditCount24h: number;
};

export type AdminMember = {
  membershipId: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: AdminRole;
  status: AdminMembershipStatus;
  createdAt: string;
  updatedAt: string;
};

export type AdminInvitation = {
  invitationId: string;
  email: string;
  role: AdminRole | null;
  state: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  acceptInvitationUrl: string;
};

export type AdminPolicyRule = {
  id: string;
  orgId: string;
  name: string;
  mode: PolicyMode;
  enabled: boolean;
  blockedTerms: string[];
};

export type AdminAuditStatus = 'success' | 'denied' | 'failed';

export type AdminAuditEvent = {
  id: string;
  ts: string;
  orgId: string;
  actorId: string;
  action: string;
  resource: string;
  status: AdminAuditStatus;
  payload: Record<string, unknown>;
};

export type AdminApprovalRequest = {
  id: string;
  orgId: string;
  requestedByUserId: string;
  action: string;
  resource: string;
  justification: string | null;
  status: ApprovalStatus;
  conversationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  decidedAt: string | null;
};
