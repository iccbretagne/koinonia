import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ApiError } from "@/lib/api-utils";
import type { SettingsInput } from "../schemas";

export const DEFAULT_OBSERVATION_MONTHS = 3;
export const DEFAULT_RETENTION_MONTHS = 12;

export type ServingSettingsView = {
  observationMonths: number;
  retentionMonths: number;
  pvsDepartments: { id: string; name: string; contactEmail: string | null }[];
};

/** Durées de l'église (valeurs par défaut sans réglage enregistré). */
export async function getServingDurations(churchId: string): Promise<{ observationMonths: number; retentionMonths: number }> {
  const row = await prisma.servingSettings.findUnique({ where: { churchId } });
  return {
    observationMonths: row?.observationMonths ?? DEFAULT_OBSERVATION_MONTHS,
    retentionMonths: row?.retentionMonths ?? DEFAULT_RETENTION_MONTHS,
  };
}

export async function getServingSettings(churchId: string, pvsDeptIds: string[]): Promise<ServingSettingsView> {
  const [durations, departments] = await Promise.all([
    getServingDurations(churchId),
    prisma.department.findMany({
      where: { id: { in: pvsDeptIds } },
      select: { id: true, name: true, contactEmail: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { ...durations, pvsDepartments: departments };
}

/**
 * Enregistre durées et adresses email du PVS. Seuls les départements PVS de l'église sont
 * modifiables ici : un identifiant étranger est refusé, jamais ignoré en silence.
 */
export async function updateServingSettings(
  input: SettingsInput,
  pvsDeptIds: string[],
  userId: string
): Promise<ServingSettingsView> {
  const { churchId, observationMonths, retentionMonths, pvsEmails } = input;
  if (pvsEmails.some((e) => !pvsDeptIds.includes(e.departmentId))) {
    throw new ApiError(400, "Seule l'adresse d'un département Vie des STAR peut être réglée ici.");
  }
  await prisma.$transaction([
    prisma.servingSettings.upsert({
      where: { churchId },
      create: { churchId, observationMonths, retentionMonths },
      update: { observationMonths, retentionMonths },
    }),
    ...pvsEmails.map((e) =>
      prisma.department.update({ where: { id: e.departmentId }, data: { contactEmail: e.email } })
    ),
  ]);
  await logAudit({
    userId,
    churchId,
    action: "UPDATE",
    entityType: "ServingSettings",
    entityId: churchId,
    details: { observationMonths, retentionMonths, pvsEmails },
  });
  return getServingSettings(churchId, pvsDeptIds);
}
