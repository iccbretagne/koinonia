import { prisma } from "@/lib/prisma";

/** Clé réservée à l'interrupteur général « Recevoir les notifications sur mes appareils ». */
export const PUSH_GLOBAL_DOMAIN = "*";

/**
 * Décide si une notification native part pour ce domaine (spec 068). Fonction pure. Un domaine
 * jamais réglé est **activé** : l'utilisateur a demandé les notifications en activant un appareil.
 */
export function resolvePushPreference({
  globalEnabled,
  domainPreference,
}: {
  globalEnabled: boolean;
  domainPreference: boolean | undefined;
}): boolean {
  if (!globalEnabled) return false;
  return domainPreference ?? true;
}

/** Préférence push effective de chaque utilisateur pour un domaine. */
export async function pushAllowedByUser(userIds: string[], domain: string): Promise<Map<string, boolean>> {
  const rows = await prisma.notificationPushPreference.findMany({
    where: { userId: { in: userIds }, domain: { in: [PUSH_GLOBAL_DOMAIN, domain] } },
  });
  const byUser = new Map<string, { global?: boolean; domain?: boolean }>();
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? {};
    if (row.domain === PUSH_GLOBAL_DOMAIN) entry.global = row.enabled;
    else entry.domain = row.enabled;
    byUser.set(row.userId, entry);
  }
  return new Map(
    userIds.map((userId) => {
      const prefs = byUser.get(userId) ?? {};
      return [userId, resolvePushPreference({ globalEnabled: prefs.global ?? true, domainPreference: prefs.domain })];
    })
  );
}

/** Préférences push brutes d'un utilisateur (domaine → activé), pour la vue des préférences. */
export async function getPushPreferenceRows(userId: string): Promise<Map<string, boolean>> {
  const rows = await prisma.notificationPushPreference.findMany({ where: { userId } });
  return new Map(rows.map((row) => [row.domain, row.enabled]));
}

/** Écrit des préférences push (clés déjà validées par l'appelant). */
export async function upsertPushPreferences(userId: string, entries: Array<[string, boolean]>): Promise<void> {
  if (entries.length === 0) return;
  await prisma.$transaction(
    entries.map(([domain, enabled]) =>
      prisma.notificationPushPreference.upsert({
        where: { userId_domain: { userId, domain } },
        update: { enabled },
        create: { userId, domain, enabled },
      })
    )
  );
}
