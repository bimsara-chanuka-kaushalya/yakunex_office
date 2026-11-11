import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertCanAssignRole, assertCanManageTarget } from './role-rules';

describe('assertCanAssignRole', () => {
  it('lets a Super Admin assign any role', () => {
    expect(() => assertCanAssignRole(Role.SUPER_ADMIN, Role.ADMIN)).not.toThrow();
    expect(() => assertCanAssignRole(Role.SUPER_ADMIN, Role.SUPER_ADMIN)).not.toThrow();
  });

  it('lets an Admin assign staff-level roles', () => {
    expect(() => assertCanAssignRole(Role.ADMIN, Role.STAFF)).not.toThrow();
    expect(() => assertCanAssignRole(Role.ADMIN, Role.INTERN)).not.toThrow();
    expect(() => assertCanAssignRole(Role.ADMIN, Role.PROJECT_MANAGER)).not.toThrow();
  });

  it('stops an Admin from creating or promoting Admins', () => {
    expect(() => assertCanAssignRole(Role.ADMIN, Role.ADMIN)).toThrow(ForbiddenException);
    expect(() => assertCanAssignRole(Role.ADMIN, Role.SUPER_ADMIN)).toThrow(ForbiddenException);
  });

  it('stops non-admin roles from assigning any role', () => {
    expect(() => assertCanAssignRole(Role.STAFF, Role.INTERN)).toThrow(ForbiddenException);
    expect(() => assertCanAssignRole(Role.PROJECT_MANAGER, Role.STAFF)).toThrow(ForbiddenException);
  });
});

describe('assertCanManageTarget', () => {
  it('protects Super Admin accounts from everyone except Super Admins', () => {
    expect(() => assertCanManageTarget(Role.ADMIN, Role.SUPER_ADMIN)).toThrow(ForbiddenException);
    expect(() => assertCanManageTarget(Role.SUPER_ADMIN, Role.SUPER_ADMIN)).not.toThrow();
  });

  it('protects Admin accounts from Admins', () => {
    expect(() => assertCanManageTarget(Role.ADMIN, Role.ADMIN)).toThrow(ForbiddenException);
    expect(() => assertCanManageTarget(Role.ADMIN, Role.STAFF)).not.toThrow();
  });
});
