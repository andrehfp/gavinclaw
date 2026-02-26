import type { AdminRole } from '@/lib/server/admin/types';

export type MembershipForAdminGuard = {
  id: string;
  role: AdminRole;
  status: 'active' | 'pending' | 'inactive';
};

export function assertNotRemovingLastActiveAdmin(input: {
  memberships: MembershipForAdminGuard[];
  targetMembershipId: string;
  nextRole?: AdminRole;
}): void {
  const target = input.memberships.find((membership) => membership.id === input.targetMembershipId);
  if (!target) {
    return;
  }

  // Only active admins contribute to guaranteed org administration continuity.
  if (target.status !== 'active' || target.role !== 'admin') {
    return;
  }

  const activeAdminCount = input.memberships.filter(
    (membership) => membership.status === 'active' && membership.role === 'admin',
  ).length;

  const staysAdmin = input.nextRole === undefined ? false : input.nextRole === 'admin';
  if (!staysAdmin && activeAdminCount <= 1) {
    throw new Error('At least one active admin must remain in this organization.');
  }
}
