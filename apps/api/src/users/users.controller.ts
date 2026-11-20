import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PERMISSIONS } from '../rbac/permissions';
import { ChangeRoleDto, ChangeStatusDto, CreateUserDto, ListUsersQuery, SetPermissionsDto } from './dto/users.dto';
import { UsersService } from './users.service';

function metaOf(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@CurrentUser() actor: AuthUser, @Query() query: ListUsersQuery) {
    return this.users.list(actor, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto, @Req() req: Request) {
    return this.users.create(actor, dto, metaOf(req));
  }

  @Post(':id/invite-link')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  generateInviteLink(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.users.generateInviteLink(actor, id, metaOf(req));
  }

  @Patch(':id/role')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLES)
  changeRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: Request,
  ) {
    return this.users.changeRole(actor, id, dto, metaOf(req));
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  changeStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @Req() req: Request,
  ) {
    return this.users.changeStatus(actor, id, dto.status, metaOf(req));
  }

  @Get(':id/permissions')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE_PERMISSIONS)
  getPermissions(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.getPermissionOverrides(actor, id);
  }

  @Put(':id/permissions')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE_PERMISSIONS)
  setPermissions(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetPermissionsDto,
    @Req() req: Request,
  ) {
    return this.users.setPermissionOverrides(actor, id, dto, metaOf(req));
  }

  @Get('permission-catalog')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE_PERMISSIONS)
  catalog() {
    return this.users.permissionCatalog();
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  bulkCreate(
    @CurrentUser() actor: AuthUser,
    @Body() body: { rows: Array<{ fullName: string; nameWithInitials?: string; lastName?: string; role: Role; title?: string; email?: string }> },
    @Req() req: Request,
  ) {
    return this.users.bulkCreate(actor, body.rows ?? [], metaOf(req));
  }

  @Post(':id/offboard')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  offboard(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Req() req: Request,
  ) {
    return this.users.offboardUser(actor, id, body?.reason, metaOf(req));
  }

  @Post(':id/promote-staff')
  @RequirePermissions(PERMISSIONS.USERS_ASSIGN_ROLES)
  promoteStaff(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { title?: string },
    @Req() req: Request,
  ) {
    return this.users.promoteInternToStaff(actor, id, body?.title, metaOf(req));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_WRITE)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.users.deleteUser(actor, id, metaOf(req));
  }
}
