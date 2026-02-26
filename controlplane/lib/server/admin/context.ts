import { ADMIN_ROLES } from '@/lib/rbac';
import { requireAuthenticatedContext, requireRole, type ProtectedContext } from '@/lib/server/authz';

export async function requireAdminContext(): Promise<ProtectedContext> {
  const context = await requireAuthenticatedContext();
  requireRole(context, ADMIN_ROLES);
  return context;
}
