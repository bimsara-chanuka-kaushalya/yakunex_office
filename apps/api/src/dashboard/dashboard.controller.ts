import { Controller, Get } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PERMISSIONS } from '../rbac/permissions';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('me')
  me(@CurrentUser() actor: AuthUser) {
    return this.dashboard.personal(actor);
  }

  @Get('admin')
  @RequirePermissions(PERMISSIONS.DASHBOARD_ADMIN)
  admin(@CurrentUser() actor: AuthUser) {
    return this.dashboard.adminSummary(actor);
  }
}
