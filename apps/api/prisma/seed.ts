/**
 * Clean Supabase & PostgreSQL Seed Script for ProjectFlow.
 * Seeds only essential system data:
 * 1. Default Organization (ProjectFlow Workspace)
 * 2. Full Role-Based Access Control (RBAC) matrix for all 5 roles
 * 3. Default Core Department
 * 4. Initial Super Admin Account (no fake/dummy projects, clients, or tasks)
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_ROLE_PERMISSIONS, PermissionKey } from '../src/rbac/permissions';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const seedPassword = process.env.SEED_PASSWORD || 'ChangeMe!2026';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@projectflow.local';
  const adminName = process.env.SEED_ADMIN_NAME || 'System Administrator';

  console.log('⚡ Initializing ProjectFlow database with clean production-ready structure...');

  // 1. Organization
  const organization = await prisma.organization.upsert({
    where: { slug: 'projectflow' },
    update: {},
    create: {
      name: 'ProjectFlow Workspace',
      slug: 'projectflow',
      timezone: 'Asia/Colombo',
      isActive: true,
    },
  });

  // 2. Role Permissions (RBAC Matrix)
  const rows = (Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]).flatMap((role) =>
    DEFAULT_ROLE_PERMISSIONS[role].map((permissionKey: PermissionKey) => ({
      organizationId: organization.id,
      role,
      permissionKey,
    })),
  );
  await prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });

  // 3. Department
  const coreDept = await prisma.department.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Engineering' } },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Engineering',
      description: 'Core engineering and software delivery department',
    },
  });

  // 4. Initial Super Admin Account
  const passwordHash = await argon2.hash(seedPassword, { type: argon2.argon2id });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.SUPER_ADMIN,
    },
    create: {
      organizationId: organization.id,
      email: adminEmail,
      fullName: adminName,
      title: 'Workspace Administrator',
      role: Role.SUPER_ADMIN,
      departmentId: coreDept.id,
      passwordHash,
      mustChangePassword: false,
    },
  });

  console.log(`✅ Organization created: ${organization.name} (${organization.slug})`);
  console.log(`✅ System RBAC permissions provisioned across all roles.`);
  console.log(`✅ Initial Super Admin created: ${adminUser.email}`);
  console.log(`🚀 Database is ready and completely clean (zero dummy data).`);
}

main()
  .catch((error) => {
    console.error('Error during database seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
