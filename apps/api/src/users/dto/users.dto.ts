import { Role, UserStatus } from '@prisma/client';
import { COMPANY_ROLE_CODES, type CompanyRoleCode } from '../company-identity';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListUsersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateUserDto {
  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  companyId?: string;

  @IsOptional()
  @IsIn([...COMPANY_ROLE_CODES])
  roleCode?: CompanyRoleCode;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  title?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class ChangeRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class ChangeStatusDto {
  @IsIn([UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DEACTIVATED])
  status!: UserStatus;
}

export class SetPermissionsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  grants!: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  revokes!: string[];
}
