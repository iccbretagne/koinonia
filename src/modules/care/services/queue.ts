import { prisma } from "@/lib/prisma";
import type { CareAccess } from "../auth";

/**
 * File « à qualifier » du suivi pastoral (spec 092) : demandes de rendez-vous en attente et suivis
 * de nouveaux convertis pas encore confiés. Réservée à `care:qualify` — sans ce droit, `null`
 * (aucune file, pas même vide). Mêmes nombres que les pastilles des onglets de `/care`.
 */
export async function careQueueCounts(
  access: Pick<CareAccess, "canQualify">,
  churchId: string
): Promise<{ requests: number; followUps: number } | null> {
  if (!access.canQualify) return null;
  const [requests, followUps] = await Promise.all([
    prisma.appointmentRequest.count({ where: { churchId, status: "PENDING" } }),
    prisma.msdpFollowUp.count({ where: { churchId, status: "SUBMITTED" } }),
  ]);
  return { requests, followUps };
}
