import { Role } from '@prisma/client';

export const COMPANY_ROLE_CODES = ['CEO', 'MD', 'DIR', 'HR', 'PM', 'DEV', 'INT', 'STF'] as const;
export type CompanyRoleCode = (typeof COMPANY_ROLE_CODES)[number];

export function resolveCompanyRoleCode(
  role: Role,
  title?: string | null,
  explicitCode?: string | null,
): CompanyRoleCode {
  const upper = explicitCode?.trim().toUpperCase();
  if (upper && (COMPANY_ROLE_CODES as readonly string[]).includes(upper)) {
    return upper as CompanyRoleCode;
  }

  const t = (title ?? '').toLowerCase();
  if (/\b(ceo|chief\s*executive)\b/.test(t)) {
    return 'CEO';
  }
  if (/\b(md|managing\s*director)\b/.test(t)) {
    return 'MD';
  }
  if (/\b(hr|human\s*resources?|people\s*ops|talent)\b/.test(t)) {
    return 'HR';
  }
  if (/\b(director|cto|coo|cfo|founder|vp|management|head\s*of)\b/.test(t)) {
    return 'DIR';
  }
  if (/\b(project\s*manager|scrum\s*master|delivery\s*lead|\bpm\b)\b/.test(t)) {
    return 'PM';
  }
  if (/\b(intern|trainee)\b/.test(t)) {
    return 'INT';
  }
  if (/\b(dev|developer|engineer|software|frontend|backend|fullstack|full\s*stack|qa|mobile|architect|devops)\b/.test(t)) {
    return 'DEV';
  }

  switch (role) {
    case Role.SUPER_ADMIN:
    case Role.ADMIN:
      return 'DIR';
    case Role.PROJECT_MANAGER:
      return 'PM';
    case Role.INTERN:
      return 'INT';
    case Role.STAFF:
    default:
      return 'STF';
  }
}

export function formatCompanyId(roleCode: CompanyRoleCode, sequence: number): string {
  return `YNX-${roleCode}-${String(sequence).padStart(4, '0')}`;
}

export function buildCompanyEmail(
  fullName: string,
  roleCode: CompanyRoleCode,
  suffix?: number,
  lastName?: string,
): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const rawLast = (lastName?.trim() ? lastName.trim().split(/\s+/).pop() : undefined) ?? parts[parts.length - 1] ?? 'user';
  const cleanLast = rawLast.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
  const localPart = suffix && suffix > 1 ? `${cleanLast}${suffix}` : cleanLast;
  return `${localPart}@${roleCode.toLowerCase()}.yakunx.com`;
}

