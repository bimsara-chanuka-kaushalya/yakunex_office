import { Role } from '@prisma/client';
import { RbacService } from './rbac.service';
import { PERMISSIONS } from './permissions';

function buildService(
  defaults: string[],
  overrides: Array<{ permissionKey: string; granted: boolean }>,
  title: string | null = null,
) {
  const prisma = {
    rolePermission: {
      findMany: jest.fn().mockResolvedValue(defaults.map((permissionKey) => ({ permissionKey }))),
    },
    userPermission: {
      findMany: jest.fn().mockResolvedValue(overrides),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(title ? { title } : null),
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

  it('applies 6-tier designation rules for Company Secretary, CFO, and Tech Lead', async () => {
    const secSvc = buildService(
      [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.PROJECTS_WRITE],
      [],
      'Company Secretary',
    );
    const secPerms = await secSvc.effectivePermissions('u_sec', 'org1', Role.ADMIN);
    expect(secPerms.has(PERMISSIONS.LEGAL_WRITE)).toBe(true);
    expect(secPerms.has(PERMISSIONS.FINANCIALS_READ)).toBe(true);
    expect(secPerms.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(secPerms.has(PERMISSIONS.PROJECTS_WRITE)).toBe(false);

    const tlSvc = buildService([PERMISSIONS.TASKS_READ], [], 'Tech Lead');
    const tlPerms = await tlSvc.effectivePermissions('u_tl', 'org1', Role.STAFF);
    expect(tlPerms.has(PERMISSIONS.CODE_DEPLOY)).toBe(true);

    const cfoSvc = buildService([PERMISSIONS.CODE_DEPLOY], [], 'Chief Financial Officer');
    const cfoPerms = await cfoSvc.effectivePermissions('u_cfo', 'org1', Role.ADMIN);
    expect(cfoPerms.has(PERMISSIONS.FINANCIALS_WRITE)).toBe(true);
    expect(cfoPerms.has(PERMISSIONS.CODE_DEPLOY)).toBe(false);
  });
});
