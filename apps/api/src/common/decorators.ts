import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './types';

export const IS_PUBLIC_KEY = 'projectflow:isPublic';
export const PERMISSIONS_KEY = 'projectflow:permissions';

/** Marks a route as reachable without a session. Everything else requires authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires ALL listed permission keys for the caller (role defaults + per-user overrides). */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
