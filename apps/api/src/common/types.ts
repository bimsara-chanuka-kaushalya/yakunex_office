import type { Role, UserStatus } from '@prisma/client';

/** The authenticated principal attached to each request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  companyId: string | null;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  organizationId: string;
  mustChangePassword: boolean;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
