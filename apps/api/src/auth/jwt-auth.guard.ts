import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { AuthUser } from '../common/types';
import { config } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

type AuthenticatedRequest = Request & { cookies?: Record<string, string>; user?: AuthUser };

/**
 * Global guard. Every route requires a valid access token unless marked @Public().
 * The user is reloaded on each request so suspended or deleted accounts lose access immediately.
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

    let subject: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: config.jwtAccessSecret,
      });
      subject = payload.sub;
    } catch {
      throw new UnauthorizedException('Your session has expired.');
    }

    const user = await this.prisma.findActiveUserCached(subject);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your account is not active.');
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
    };
    return true;
  }
}

function extractBearer(header?: string): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}
