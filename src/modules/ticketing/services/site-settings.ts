/**
 * Activation des sites d'événement par l'Admin de l'église (spec 084) : coupée par défaut. Coupée,
 * aucun site de l'église n'est servi ; la page d'inscription standard reste disponible.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

export async function getSitesEnabled(churchId: string): Promise<boolean> {
  const row = await (await db()).ticketingSiteSettings.findUnique({ where: { churchId } });
  return row?.enabled ?? false;
}

export async function setSitesEnabled(churchId: string, enabled: boolean, actorId: string): Promise<void> {
  await (await db()).ticketingSiteSettings.upsert({ where: { churchId }, create: { churchId, enabled }, update: { enabled } });
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId: actorId, churchId, action: "UPDATE", entityType: "TicketingSiteSettings", entityId: churchId, details: { enabled } });
}
