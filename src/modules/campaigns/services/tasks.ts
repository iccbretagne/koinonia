import { runDueReminders } from "./notify";
import { purgeExpiredFiles } from "./files";

/**
 * Tâche planifiée des campagnes (spec 090), appelée une fois par jour par `/api/cron` :
 * relance automatique J-2 des questionnaires non soumis, puis purge des fichiers des campagnes
 * clôturées depuis plus que leur durée de conservation. Idempotente (horodatages).
 */
export async function runCampaignTasks(now = new Date()) {
  const reminded = await runDueReminders(now);
  const filesPurged = await purgeExpiredFiles(now);
  return { reminded, filesPurged };
}
