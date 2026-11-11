/**
 * Clean Supabase & PostgreSQL Seed Script for Yakunex Hub.
 * Seeds only essential system data:
 * 1. Default Organization (Yakunex Hub)
 * 2. Full Role-Based Access Control (RBAC) matrix for all 5 roles
 * 3. Default Core Department
 * 4. Initial Super Admin Account (no fake/dummy projects, clients, or tasks)
 */
import '../src/config/config';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_ROLE_PERMISSIONS, PermissionKey } from '../src/rbac/permissions';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main(): Promise<void> {
  const seedPassword = process.env.SEED_PASSWORD || 'ChangeMe!2026';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@yakunexhub.local';
  const adminName = process.env.SEED_ADMIN_NAME || 'Yakunex Hub Administrator';

  console.log('⚡ Initializing Yakunex Hub database with clean production-ready structure...');

  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_key" ON "User"("companyId");`);

  // 1. Organization - check for existing or create new
  let organization = await prisma.organization.findFirst({
    where: { OR: [{ slug: 'yakunex-hub' }, { slug: 'projectflow' }] },
  });

  if (organization) {
    organization = await prisma.organization.update({
      where: { id: organization.id },
      data: {
        name: 'Yakunex Hub',
        slug: 'yakunex-hub',
      },
    });
  } else {
    organization = await prisma.organization.create({
      data: {
        name: 'Yakunex Hub',
        slug: 'yakunex-hub',
        timezone: 'Asia/Colombo',
        isActive: true,
      },
    });
  }

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

  // Remove legacy duplicate alias if present so only one clean Super Admin row exists
  await prisma.user.deleteMany({
    where: { email: 'admin@projectflow.local' },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.SUPER_ADMIN,
      fullName: adminName,
      companyId: 'YNX-0001',
      passwordHash,
      status: 'ACTIVE',
      lockedUntil: null,
      failedLoginCount: 0,
      mustChangePassword: false,
    },
    create: {
      organizationId: organization.id,
      companyId: 'YNX-0001',
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
  console.log(`✅ Initial Super Admin ready: ${adminUser.companyId} / ${adminUser.email}`);
  console.log(`🚀 Database is ready and completely clean (zero dummy data).`);
}

main()
  .catch((error) => {
    console.error('Error during database seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
