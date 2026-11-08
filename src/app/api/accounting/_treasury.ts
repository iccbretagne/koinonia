import { ApiError } from "@/lib/api-utils";
import { registry } from "@/lib/registry";

/**
 * Compte de trésorerie d'un mouvement de la comptabilité (« Payé depuis », « Rendu sur » — specs
 * 076 et 078, ADR-0027) : validé ici, couche qui seule importe la comptabilité et la trésorerie.
 * Compte actif de l'église, mois ouvert ; refusé si la trésorerie est désactivée. `null` = compte
 * commun (non repris).
 */
export async function resolveTreasuryAccount(churchId: string, accountId: string | null | undefined, date: Date) {
  if (!accountId) return null;
  if (!registry.has("treasury")) throw new ApiError(400, "La trésorerie n'est pas activée");
  const { assertTreasuryDateOpen, getActiveTreasuryAccount } = await import("@/modules/treasury");
  await getActiveTreasuryAccount(churchId, accountId);
  await assertTreasuryDateOpen(churchId, date);
  return accountId;
}
