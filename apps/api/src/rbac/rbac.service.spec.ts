import { Role } from '@prisma/client';
import { RbacService } from './rbac.service';
import { PERMISSIONS } from './permissions';

function buildService(defaults: string[], overrides: Array<{ permissionKey: string; granted: boolean }>) {
  const prisma = {
    rolePermission: {
      findMany: jest.fn().mockResolvedValue(defaults.map((permissionKey) => ({ permissionKey }))),
    },
    userPermission: {
      findMany: jest.fn().mockResolvedValue(overrides),
    },
  };
  return new RbacService(prisma as never);
}

describe('RbacService.effectivePermissions', () => {
  it('always gives Super Admin every permission, even with an empty matrix', async () => {
    const service = buildService([], []);
    const effective = await service.effectivePermissions('u1', 'org1', Role.SUPER_ADMIN);
    expect(effective.has(PERMISSIONS.USERS_MANAGE_PERMISSIONS)).toBe(true);
    expect(effective.has(PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it('adds a per-user grant on top of role defaults', async () => {
    const service = buildService([PERMISSIONS.TASKS_READ], [
      { permissionKey: PERMISSIONS.PROJECTS_WRITE, granted: true },
    ]);
    const effective = await service.effectivePermissions('u1', 'org1', Role.STAFF);
    expect(effective.has(PERMISSIONS.TASKS_READ)).toBe(true);
    expect(effective.has(PERMISSIONS.PROJECTS_WRITE)).toBe(true);
  });

  it('removes a role default when the user has an explicit revoke', async () => {
    const service = buildService([PERMISSIONS.TASKS_READ, PERMISSIONS.TIME_OWN], [
      { permissionKey: PERMISSIONS.TIME_OWN, granted: false },
    ]);
    const effective = await service.effectivePermissions('u1', 'org1', Role.STAFF);
    expect(effective.has(PERMISSIONS.TIME_OWN)).toBe(false);
    expect(effective.has(PERMISSIONS.TASKS_READ)).toBe(true);
  });
});
