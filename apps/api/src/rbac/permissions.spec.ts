import { Role } from '@prisma/client';
import { ALL_PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, isPermissionKey } from './permissions';

describe('default role permissions', () => {
  it('gives Super Admin the full permission catalogue', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[Role.SUPER_ADMIN].sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('never gives interns user-management or approval powers', () => {
    const intern = DEFAULT_ROLE_PERMISSIONS[Role.INTERN];
    expect(intern).not.toContain(PERMISSIONS.USERS_WRITE);
    expect(intern).not.toContain(PERMISSIONS.TIME_APPROVE);
    expect(intern).not.toContain(PERMISSIONS.DASHBOARD_ADMIN);
  });

  it('lets Admins manage users and approve timesheets', () => {
    const admin = DEFAULT_ROLE_PERMISSIONS[Role.ADMIN];
    expect(admin).toContain(PERMISSIONS.USERS_WRITE);
    expect(admin).toContain(PERMISSIONS.TIME_APPROVE);
  });

  it('recognises only catalogue keys', () => {
    expect(isPermissionKey('users:write')).toBe(true);
    expect(isPermissionKey('users:delete_everything')).toBe(false);
  });
});
