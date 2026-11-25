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

/**
 * Changement du compte d'une tranche déjà remise (spec 089) : le mois de la remise doit être
 * ouvert pour l'ancien compte comme pour le nouveau (une ligne quitte un registre, entre dans un
 * autre) ; le nouveau compte doit être actif.
 */
export async function validatePaymentAccountChange(
  churchId: string,
  { releasedAt, previous, next }: { releasedAt: Date; previous: string | null; next: string | null }
) {
  if (previous && registry.has("treasury")) {
    const { assertTreasuryDateOpen } = await import("@/modules/treasury");
    await assertTreasuryDateOpen(churchId, releasedAt);
  }
  return resolveTreasuryAccount(churchId, next, releasedAt);
}
