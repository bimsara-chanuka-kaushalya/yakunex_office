import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowWhenPasswordChangeRequired, CurrentUser, Public } from '../common/decorators';
import type { AuthUser, RequestMeta } from '../common/types';
import { config } from '../config/config';
import { RbacService } from '../rbac/rbac.service';
import { AuthService, TokenPair } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  TwoFactorDisableDto,
  TwoFactorVerifyDto,
  VerifyPasswordDto,
} from './dto/auth.dto';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function metaOf(req: Request): RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function setAuthCookies(res: Response, tokens: TokenPair): void {
  const base = { httpOnly: true, secure: config.isProd, sameSite: 'lax' as const };
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: config.accessTokenTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    // Only sent to the refresh endpoint, which limits exposure of the long-lived token.
    path: '/api/auth',
    maxAge: config.refreshTokenTtlDays * 86_400_000,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: RbacService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, metaOf(req), dto.totpCode);
    if (result.requiresTwoFactor) {
      return { requiresTwoFactor: true, message: result.message };
    }
    setAuthCookies(res, result.tokens);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], metaOf(req));
    setAuthCookies(res, tokens);
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    return { ok: true };
  }

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    // Effective permissions let the UI hide controls. The server still enforces every route.
    const permissions = await this.rbac.effectivePermissions(user.id, user.organizationId, user.role);
    return { user, permissions: [...permissions] };
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) {
    return this.auth.listActiveSessions(user.id);
  }

  @AllowWhenPasswordChangeRequired()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.logoutAllDevices(user, metaOf(req));
    clearAuthCookies(res);
    return result;
  }

  @AllowWhenPasswordChangeRequired()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword, metaOf(req));
    clearAuthCookies(res);
    return { ok: true, message: 'Password changed. Please sign in again.' };
  }

  @Get('2fa/status')
  getTwoFactorStatus(@CurrentUser() user: AuthUser) {
    return this.auth.getTwoFactorStatus(user.id);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  setupTwoFactor(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.setupTwoFactor(user, metaOf(req));
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  enableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorVerifyDto, @Req() req: Request) {
    return this.auth.enableTwoFactor(user, dto.code, metaOf(req));
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorDisableDto, @Req() req: Request) {
    return this.auth.disableTwoFactor(user, dto.password, dto.code, metaOf(req));
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('verify-password')
  @HttpCode(HttpStatus.OK)
  verifyPassword(@CurrentUser() user: AuthUser, @Body() dto: VerifyPasswordDto, @Req() req: Request) {
    return this.auth.verifyStepUpPassword(user, dto.password, metaOf(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto.email, metaOf(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto.token, dto.newPassword, metaOf(req));
  }
}
