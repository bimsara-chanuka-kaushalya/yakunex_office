import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './types';

export const IS_PUBLIC_KEY = 'yakunex-hub:isPublic';
export const PERMISSIONS_KEY = 'yakunex-hub:permissions';
export const ALLOW_PASSWORD_CHANGE_KEY = 'yakunex-hub:allowWhenPasswordChangeRequired';

/** Marks a route as reachable without a session. Everything else requires authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Allows a route to run while mustChangePassword is true (e.g. /auth/me, /auth/change-password). */
export const AllowWhenPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

/** Requires ALL listed permission keys for the caller (role defaults + per-user overrides). */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
