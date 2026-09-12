/**
 * Règle unique de verrouillage d'une absence passée, partagée par l'UI et le service (#523).
 *
 * Sémantique « jour » : `startDate`/`endDate` sont saisis en dates (envoyées à minuit UTC), une
 * absence reste donc modifiable/annulable jusqu'à la fin de son dernier jour (UTC).
 */
export function isAbsencePast(endDate: Date | string, now: Date = new Date()): boolean {
  const end = new Date(endDate);
  const endOfDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1);
  return now.getTime() >= endOfDay;
}
