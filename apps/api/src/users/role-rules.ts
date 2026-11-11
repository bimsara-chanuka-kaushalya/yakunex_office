import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Who may assign which roles. Pure function so it can be unit-tested without a database.
 * - Only Super Admins may create or promote anyone to ADMIN or SUPER_ADMIN.
 * - Admins may assign PROJECT_MANAGER, STAFF and INTERN.
 */
export function assertCanAssignRole(actorRole: Role, targetRole: Role): void {
  if (actorRole === Role.SUPER_ADMIN) return;

  if (actorRole === Role.ADMIN) {
    if (targetRole === Role.SUPER_ADMIN || targetRole === Role.ADMIN) {
      throw new ForbiddenException('Only a Super Admin can assign Admin roles.');
    }
    return;
  }

  throw new ForbiddenException('You cannot change user roles.');
}

/** Whether the actor may modify a target account at all. */
export function assertCanManageTarget(actorRole: Role, targetRole: Role): void {
  if (targetRole === Role.SUPER_ADMIN && actorRole !== Role.SUPER_ADMIN) {
    throw new ForbiddenException('Only a Super Admin can modify a Super Admin account.');
  }
  if (targetRole === Role.ADMIN && actorRole !== Role.SUPER_ADMIN) {
    throw new ForbiddenException('Only a Super Admin can modify an Admin account.');
  }
}
