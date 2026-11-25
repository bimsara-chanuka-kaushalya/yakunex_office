import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { ALLOW_PASSWORD_CHANGE_KEY, IS_PUBLIC_KEY } from '../common/decorators';
import {
  JWT_ACCESS_AUDIENCE,
  JWT_ISSUER,
  computeSessionFingerprint,
  deriveDomainSecret,
  isTokenRevokedByEpoch,
} from '../common/security';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

type AuthenticatedRequest = Request & { cookies?: Record<string, string>; user?: AuthUser };

interface AccessTokenClaims {
  sub: string;
  typ?: string;
  fp?: string;
  iat?: number;
}

/**
 * Global guard. Every route requires a domain-separated `typ: 'access'` JWT unless marked @Public().
 * Verifies user status, password/role fingerprint, instant revocation epoch, and mustChangePassword.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.access_token ?? extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Please sign in.');
    }

    let payload: AccessTokenClaims;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: deriveDomainSecret('access-jwt'),
        issuer: JWT_ISSUER,
        audience: JWT_ACCESS_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Your session has expired.');
    }

    // Block token purpose confusion (e.g. reset or invite JWTs)
    if (payload.typ !== 'access' || !payload.sub) {
      throw new UnauthorizedException('Invalid session token.');
    }

    if (isTokenRevokedByEpoch(payload.sub, payload.iat)) {
      throw new UnauthorizedException('Your session was signed out. Please sign in again.');
    }

    const user = await this.prisma.findActiveUserCached(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your account is not active.');
    }

    if (!payload.fp || payload.fp !== computeSessionFingerprint(user)) {
      throw new UnauthorizedException('Your credentials or permissions changed. Please sign in again.');
    }

    if (user.mustChangePassword) {
      const allowPasswordChange = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowPasswordChange) {
        throw new ForbiddenException(
          'PASSWORD_CHANGE_REQUIRED: Please set a new personal password before accessing the workspace.',
        );
      }
    }

    request.user = {
      id: user.id,
      companyId: user.companyId ?? null,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      organizationId: user.organizationId,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      avatarUrl: user.avatarUrl ?? null,
    };
    return true;
  }
}

function extractBearer(header?: string): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}
