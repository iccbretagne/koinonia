import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Sauvegarde planifiée de la base",
    description: "Crée une sauvegarde vers le stockage S3 puis purge celles plus anciennes que la rétention (`BACKUP_RETENTION_DAYS`, 30 jours par défaut). 503 si S3 n'est pas configuré.",
    access: "cron",
    accessNote: "en-tête `Authorization: Bearer <CRON_SECRET>` (401 sinon)",
    response: "`{ backup, cleanedUp }` : sauvegarde créée et nombre de sauvegardes purgées",
  },
});
