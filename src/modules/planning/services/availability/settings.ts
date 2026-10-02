import { defaultDb, type DbClient } from "./db";

/**
 * Réglages de la collecte des disponibilités (spec 058). Absence de ligne = collecte active avec
 * la fenêtre par défaut : ouverture 2 mois avant le mois cible, clôture 7 jours avant son premier
 * événement, relance 3 jours avant la clôture.
 */

export interface AvailabilitySettingsValues {
  enabled: boolean;
  openMonthsBefore: number;
  closeDaysBefore: number;
  relanceDaysBefore: number;
}

export const DEFAULT_AVAILABILITY_SETTINGS: AvailabilitySettingsValues = {
  enabled: true,
  openMonthsBefore: 2,
  closeDaysBefore: 7,
  relanceDaysBefore: 3,
};

const SELECT = { enabled: true, openMonthsBefore: true, closeDaysBefore: true, relanceDaysBefore: true } as const;

export async function getAvailabilitySettings(churchId: string, db?: DbClient): Promise<AvailabilitySettingsValues> {
  db ??= await defaultDb();
  const row = await db.availabilitySettings.findUnique({ where: { churchId }, select: SELECT });
  return row ?? { ...DEFAULT_AVAILABILITY_SETTINGS };
}

export async function updateAvailabilitySettings(
  churchId: string,
  data: AvailabilitySettingsValues,
  db?: DbClient
): Promise<AvailabilitySettingsValues> {
  db ??= await defaultDb();
  return db.availabilitySettings.upsert({ where: { churchId }, create: { churchId, ...data }, update: data, select: SELECT });
}

/** Réglages de toutes les églises qui en ont, indexés par église (le cron en lit plusieurs d'un coup). */
export async function listAvailabilitySettingsByChurch(db?: DbClient): Promise<Map<string, AvailabilitySettingsValues>> {
  db ??= await defaultDb();
  const rows = await db.availabilitySettings.findMany({ select: { churchId: true, ...SELECT } });
  return new Map(rows.map(({ churchId, ...values }) => [churchId, values]));
}
