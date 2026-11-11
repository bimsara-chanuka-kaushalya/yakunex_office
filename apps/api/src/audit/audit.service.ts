import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    // Fire-and-forget write so remote DB latency does not block user-facing HTTP responses.
    void this.prisma.auditLog
      .create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata
            ? (entry.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent?.slice(0, 500),
        },
      })
      .catch((error: unknown) => {
        // Audit failures are logged at error level so they can alert; they never crash the request.
        this.logger.error(`Failed to write audit entry ${entry.action}`, error as Error);
      });
  }
}
