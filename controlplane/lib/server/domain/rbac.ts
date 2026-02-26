import type { Role } from '@/lib/rbac';

export const DOMAIN_READ_ROLES: readonly Role[] = ['admin', 'user'];
export const DOMAIN_WRITE_ROLES: readonly Role[] = ['admin', 'user'];
export const DOMAIN_ADMIN_ROLES: readonly Role[] = ['admin'];

export function canRead(role: Role): boolean {
  return DOMAIN_READ_ROLES.includes(role);
}

export function canWrite(role: Role): boolean {
  return DOMAIN_WRITE_ROLES.includes(role);
}

export function canAdmin(role: Role): boolean {
  return DOMAIN_ADMIN_ROLES.includes(role);
}
