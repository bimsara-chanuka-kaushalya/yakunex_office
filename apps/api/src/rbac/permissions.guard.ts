import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { RbacService } from './rbac.service';

/**
 * Enforced on the server for every protected route. The UI hides buttons for convenience only;
 * this guard is the actual security boundary.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Not authorised.');
    }

    const effective = await this.rbac.effectivePermissions(user.id, user.organizationId, user.role);
    const allowed = required.every((permission) => effective.has(permission));
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
    return true;
  }
}
