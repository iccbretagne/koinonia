import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * Activation (spec 081) : le module actif, l'instance activée par le Super Admin et l'église
 * activée par son Admin. Coupé par défaut à chaque niveau.
 */

const INSTANCE_ID = "singleton";

async function isModuleActive(): Promise<boolean> {
  const { registry } = await import("@/lib/registry");
  return registry.has("mcp");
}

export async function getMcpInstanceSettings(): Promise<{ enabled: boolean }> {
  const row = await prisma.mcpSettings.findUnique({ where: { id: INSTANCE_ID } });
  return { enabled: row?.enabled ?? false };
}

export async function setMcpInstanceEnabled(enabled: boolean, actorId: string): Promise<void> {
  await prisma.mcpSettings.upsert({
    where: { id: INSTANCE_ID },
    create: { id: INSTANCE_ID, enabled },
    update: { enabled },
  });
  await logAudit({ userId: actorId, action: "UPDATE", entityType: "McpSettings", entityId: INSTANCE_ID, details: { enabled } });
}

export async function getMcpChurchEnabled(churchId: string): Promise<boolean> {
  const row = await prisma.mcpChurchSettings.findUnique({ where: { churchId } });
  return row?.enabled ?? false;
}

export async function setMcpChurchEnabled(churchId: string, enabled: boolean, actorId: string): Promise<void> {
  await prisma.mcpChurchSettings.upsert({ where: { churchId }, create: { churchId, enabled }, update: { enabled } });
  await logAudit({ userId: actorId, churchId, action: "UPDATE", entityType: "McpChurchSettings", entityId: churchId, details: { enabled } });
}

/** Les trois niveaux d'activation à la fois. */
export async function isMcpEnabled(churchId: string): Promise<boolean> {
  if (!(await isModuleActive())) return false;
  const [instance, church] = await Promise.all([getMcpInstanceSettings(), getMcpChurchEnabled(churchId)]);
  return instance.enabled && church;
}

/** Églises du compte où la fonction est active (choix proposé à l'autorisation). */
export async function enabledChurchesFor(churches: { id: string; name: string }[]): Promise<{ id: string; name: string }[]> {
  if (!(await isModuleActive()) || !(await getMcpInstanceSettings()).enabled) return [];
  const rows = await prisma.mcpChurchSettings.findMany({
    where: { churchId: { in: churches.map((c) => c.id) }, enabled: true },
    select: { churchId: true },
  });
  const on = new Set(rows.map((r) => r.churchId));
  return churches.filter((c) => on.has(c.id));
}
