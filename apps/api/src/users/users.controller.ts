import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
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
}
