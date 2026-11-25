import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { deriveDomainSecret } from '../common/security';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  private readonly lastChainHashByOrg = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  private computeChainHash(
    prevHash: string,
    entry: AuditEntry,
    seqTimestampIso: string,
  ): string {
    const canonical = JSON.stringify({
      prevHash,
      org: entry.organizationId,
      actor: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ts: seqTimestampIso,
    });
    return createHmac('sha256', deriveDomainSecret('audit-chain-hmac'))
      .update(canonical)
      .digest('hex');
  }

  async log(entry: AuditEntry): Promise<void> {
    const orgId = entry.organizationId || 'global';
    const prevHash = this.lastChainHashByOrg.get(orgId) ?? 'GENESIS';
    const seqTs = new Date().toISOString();
    const integrityHash = this.computeChainHash(prevHash, entry, seqTs);
    this.lastChainHashByOrg.set(orgId, integrityHash);

    const enrichedMetadata: Record<string, unknown> = {
      ...(entry.metadata ?? {}),
      _integrity: {
        alg: 'HMAC-SHA256',
        prevHash: prevHash.slice(0, 24),
        hash: integrityHash.slice(0, 24),
        ts: seqTs,
      },
    };

    // Fire-and-forget write so remote DB latency does not block user-facing HTTP responses.
    void this.prisma.auditLog
      .create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: enrichedMetadata as Prisma.InputJsonValue,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent?.slice(0, 500),
        },
      })
      .catch((error: unknown) => {
        this.logger.error(`Failed to write audit entry ${entry.action}`, error as Error);
      });
  }
}
