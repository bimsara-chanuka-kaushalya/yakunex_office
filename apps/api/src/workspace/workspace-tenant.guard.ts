import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/types';
import { WorkspaceService } from './workspace.service';

/**
 * WorkspaceService keeps a single organization's workspace in memory. This guard rejects
 * signed-in users from any other organization so tenants can never read or overwrite each
 * other's projects, chat, finance or profile data. Public (guest / portal / webhook) routes
 * have no signed-in user and are scoped by their own tokens.
 */
@Injectable()
export class WorkspaceTenantGuard implements CanActivate {
  constructor(private readonly workspace: WorkspaceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.organizationId) return true;
    const primaryOrgId = await this.workspace.getPrimaryOrgId();
    if (primaryOrgId && user.organizationId !== primaryOrgId) {
      throw new ForbiddenException('This workspace belongs to a different organization.');
    }
    return true;
  }
}
