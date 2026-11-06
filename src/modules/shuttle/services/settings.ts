/** Réglages de la navette (spec 073) : seuil d'alerte de solde bas, réservé à la compta. */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export async function getShuttleSettings(churchId: string) {
  const prisma = await db();
  const settings = await prisma.shuttleSettings.findUnique({ where: { churchId } });
  return { lowBalanceThreshold: settings?.lowBalanceThreshold === null || !settings ? null : Number(settings.lowBalanceThreshold) };
}

export async function updateLowBalanceThreshold(churchId: string, threshold: number | null, actorId: string) {
  const prisma = await db();
  const before = await getShuttleSettings(churchId);
  await prisma.shuttleSettings.upsert({
    where: { churchId },
    create: { churchId, lowBalanceThreshold: threshold, updatedById: actorId },
    update: { lowBalanceThreshold: threshold, updatedById: actorId },
  });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({
    userId: actorId,
    churchId,
    action: "UPDATE",
    entityType: "ShuttleSettings",
    entityId: churchId,
    details: { before, after: { lowBalanceThreshold: threshold } },
  });
  return { lowBalanceThreshold: threshold };
}
