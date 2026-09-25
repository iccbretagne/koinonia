import { prisma } from "@/lib/prisma";

/**
 * Réglages du module care (spec 052, T59) — délais de relance des demandes de rendez-vous
 * pastoral : non confiée (alerte aux référents) et confiée sans date fixée (alerte à
 * l'accompagnant). Même pattern que `IntegrationSettings` (spec 051).
 */

export const DEFAULT_CARE_SETTINGS = { unassignedDelayDays: 7, unscheduledDelayDays: 14 };

export interface CareDelays {
  unassignedDelayDays: number;
  unscheduledDelayDays: number;
}

export async function getCareSettings(churchId: string): Promise<CareDelays> {
  const settings = await prisma.careSettings.findUnique({
    where: { churchId },
    select: { unassignedDelayDays: true, unscheduledDelayDays: true },
  });
  return settings ?? { ...DEFAULT_CARE_SETTINGS };
}

export async function updateCareSettings(churchId: string, data: CareDelays): Promise<CareDelays> {
  return prisma.careSettings.upsert({
    where: { churchId },
    create: { churchId, ...data },
    update: data,
    select: { unassignedDelayDays: true, unscheduledDelayDays: true },
  });
}
