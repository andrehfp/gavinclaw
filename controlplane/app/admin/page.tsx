import { redirect } from 'next/navigation';
import type { AdminRole } from '@/lib/server/admin/types';
import { ApiError } from '@/lib/server/authz';
import { requireAdminContext } from '@/lib/server/admin/context';
import AdminDashboardClient from './AdminDashboardClient';

type InitialAdminContext = {
  orgId: string;
  orgName: string;
  actorEmail: string | null;
  role: AdminRole;
};

export default async function AdminPage() {
  let initialContext: InitialAdminContext;

  try {
    const context = await requireAdminContext();

    initialContext = {
      orgId: context.orgId,
      orgName: context.orgName,
      actorEmail: context.actorEmail,
      role: context.role,
    };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/');
    }

    throw error;
  }

  return <AdminDashboardClient initialContext={initialContext} />;
}
