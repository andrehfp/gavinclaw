export const ROLES = ['admin', 'user'] as const;

export type Role = (typeof ROLES)[number];

export const READ_ROLES: readonly Role[] = ROLES;
export const WRITE_ROLES: readonly Role[] = ['admin', 'user'];
export const ADMIN_ROLES: readonly Role[] = ['admin'];

const ROLE_ALIASES: Readonly<Record<string, Role>> = {
  owner: 'admin',
  analyst: 'user',
  viewer: 'user',
  member: 'user',
};

export function normalizeRoleClaim(value: string): Role | null {
  const normalized = value.trim().toLowerCase();
  if (isRole(normalized)) {
    return normalized;
  }
  return ROLE_ALIASES[normalized] ?? null;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasRole(role: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(role);
}
