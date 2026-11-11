import { Role } from '@prisma/client';

/**
 * Permission keys. The database (RolePermission / UserPermission) is the source of truth
 * at runtime; these defaults seed RolePermission and define the catalogue shown in the UI.
 */
export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_ASSIGN_ROLES: 'users:assign_roles',
  USERS_MANAGE_PERMISSIONS: 'users:manage_permissions',
  DASHBOARD_ADMIN: 'dashboard:admin',
  AUDIT_READ: 'audit:read',
  SETTINGS_MANAGE: 'settings:manage',
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TIME_OWN: 'time:own',
  TIME_APPROVE: 'time:approve',
  LEAVE_APPROVE: 'leave:approve',
  CHAT_USE: 'chat:use',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

const P = PERMISSIONS;

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSION_KEYS,
  ADMIN: [
    P.USERS_READ,
    P.USERS_WRITE,
    P.USERS_ASSIGN_ROLES,
    P.USERS_MANAGE_PERMISSIONS,
    P.DASHBOARD_ADMIN,
    P.AUDIT_READ,
    P.SETTINGS_MANAGE,
    P.PROJECTS_READ,
    P.PROJECTS_WRITE,
    P.TASKS_READ,
    P.TASKS_WRITE,
    P.TIME_APPROVE,
    P.LEAVE_APPROVE,
    P.CHAT_USE,
  ],
  PROJECT_MANAGER: [
    P.USERS_READ,
    P.PROJECTS_READ,
    P.PROJECTS_WRITE,
    P.TASKS_READ,
    P.TASKS_WRITE,
    P.TIME_OWN,
    P.CHAT_USE,
  ],
  STAFF: [P.PROJECTS_READ, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
  INTERN: [P.PROJECTS_READ, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(value);
}
