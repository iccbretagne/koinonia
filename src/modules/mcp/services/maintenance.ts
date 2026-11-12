import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Tâche cron quotidienne : jetons et confirmations expirés depuis plus d'un jour, appels de plus de 12 mois, et
 * assistants enregistrés depuis plus de 7 jours sans aucune connexion (l'enregistrement est
 * ouvert sans compte : il ne doit pas remplir la base indéfiniment).
 */
export async function runMcpMaintenance(now = new Date()) {
  const [tokens, confirmations, calls, clients] = await Promise.all([
    prisma.mcpToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY) } } }),
    prisma.mcpConfirmation.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY) } } }),
    prisma.mcpCall.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 365 * DAY) } } }),
    prisma.mcpClient.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * DAY) }, grants: { none: {} } } }),
  ]);
  return { tokensDeleted: tokens.count, confirmationsDeleted: confirmations.count, callsDeleted: calls.count, clientsDeleted: clients.count };
}
