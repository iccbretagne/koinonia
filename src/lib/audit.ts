import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";

/** Détails ajoutés à toute entrée écrite pendant `fn` (ex. `{ via: "mcp" }`, spec 083). */
const auditContext = new AsyncLocalStorage<Record<string, unknown>>();

export function withAuditContext<T>(extra: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  return auditContext.run({ ...auditContext.getStore(), ...extra }, fn);
}

interface AuditLogEntry {
  userId: string;
  churchId?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "VIEW";
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

function withContext(details: Record<string, unknown> | undefined) {
  const extra = auditContext.getStore();
  const merged = extra ? { ...details, ...extra } : details;
  return merged ? (merged as Prisma.InputJsonValue) : Prisma.JsonNull;
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
        details: withContext(entry.details),
      },
    });
  } catch {
    // Audit logging should never break the main flow
    logger.error("Failed to write audit log");
  }
}
