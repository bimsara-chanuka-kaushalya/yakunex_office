/** Permission keys mirrored from the API. The server enforces them; the UI only uses them to hide controls. */
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

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PROJECT_MANAGER' | 'STAFF' | 'INTERN';

export const ROLE_LABELS: Record<Role, { en: string; si: string }> = {
  SUPER_ADMIN: { en: 'Super Admin', si: 'සුපර් ඇඩ්මින්' },
  ADMIN: { en: 'Admin', si: 'ඇඩ්මින්' },
  PROJECT_MANAGER: { en: 'Project Manager', si: 'ව්‍යාපෘති කළමනාකරු' },
  STAFF: { en: 'Staff / Developer', si: 'කාර්ය මණ්ඩලය / සංවර්ධක' },
  INTERN: { en: 'Intern', si: 'අභ්‍යාසලාභී' },
};
