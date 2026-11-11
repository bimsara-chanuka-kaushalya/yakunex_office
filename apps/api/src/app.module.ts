import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PermissionsGuard } from './rbac/permissions.guard';
import { RbacModule } from './rbac/rbac.module';
import { UsersModule } from './users/users.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    UsersModule,
    WorkspaceModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate first, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
