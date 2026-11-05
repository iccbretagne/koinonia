import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/**
 * Activation de l'assistant (spec 075) : le module doit être actif, l'instance activée par le
 * Super Admin, et l'église ne doit pas l'avoir coupé. Désactivé par défaut à la mise en service.
 */

const INSTANCE_ID = "instance";

export interface AssistantActor {
  id: string;
}

async function isModuleActive(): Promise<boolean> {
  const { registry } = await import("@/lib/registry");
  return registry.has("assistant");
}

export async function getInstanceSettings(): Promise<{ enabled: boolean }> {
  const row = await prisma.assistantSettings.findUnique({ where: { id: INSTANCE_ID } });
  return { enabled: row?.enabled ?? false };
}

export async function setInstanceEnabled(enabled: boolean, actor: AssistantActor) {
  await prisma.assistantSettings.upsert({
    where: { id: INSTANCE_ID },
    create: { id: INSTANCE_ID, enabled, updatedById: actor.id },
    update: { enabled, updatedById: actor.id },
  });
  await logAudit({
    userId: actor.id,
    action: "UPDATE",
    entityType: "AssistantSettings",
    entityId: INSTANCE_ID,
    details: { enabled },
  });
  return { enabled };
}

export async function getChurchSetting(churchId: string) {
  const [instance, row] = await Promise.all([
    getInstanceSettings(),
    prisma.assistantChurchSetting.findUnique({ where: { churchId } }),
  ]);
  return { instanceEnabled: instance.enabled, disabled: row?.disabled ?? false };
}

export async function setChurchDisabled(churchId: string, disabled: boolean, actor: AssistantActor) {
  await prisma.assistantChurchSetting.upsert({
    where: { churchId },
    create: { churchId, disabled, updatedById: actor.id },
    update: { disabled, updatedById: actor.id },
  });
  await logAudit({
    userId: actor.id,
    churchId,
    action: "UPDATE",
    entityType: "AssistantChurchSetting",
    entityId: churchId,
    details: { disabled },
  });
  return getChurchSetting(churchId);
}

/** Module actif ∧ instance activée ∧ église non coupée. */
export async function isAssistantEnabled(churchId: string | null | undefined): Promise<boolean> {
  if (!churchId || !(await isModuleActive())) return false;
  const { instanceEnabled, disabled } = await getChurchSetting(churchId);
  return instanceEnabled && !disabled;
}
