import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";

interface AuditLogEntry {
  userId: string;
  churchId?: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export async function logAudit(entry: AuditLogEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        churchId: entry.churchId || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details
          ? (entry.details as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch {
    // Audit logging should never break the main flow
    logger.error("Failed to write audit log");
  }
}
