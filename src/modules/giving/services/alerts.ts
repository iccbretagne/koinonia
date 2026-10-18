import { buildGivingPaymentDetailsEmail, parseEmailList, sendEmail } from "@/lib/email";
import { notifyUsersWithRole } from "@/lib/notifications";
import { logger } from "@/lib/logger";

export interface PaymentDetailsChange {
  label: string;
  before: string;
  after: string;
}

/**
 * Alerte de modification des coordonnées de paiement (spec 065). Adresses comptables de
 * l'église : envoi direct (adresse institutionnelle, liste blanche de CLAUDE.md). Sans adresse
 * comptable : notification aux Admins de l'église, dont l'email suit leurs préférences du
 * domaine `giving`. Un échec d'envoi est journalisé sans faire échouer l'enregistrement : le
 * journal des modifications fait foi.
 */
export async function alertPaymentDetailsChange(
  church: { id: string; name: string; accountingEmails: string | null },
  changes: PaymentDetailsChange[],
  actor: { id: string; name: string }
): Promise<void> {
  if (changes.length === 0) return;
  const link = "/dons";
  const email = buildGivingPaymentDetailsEmail({
    churchName: church.name,
    changes,
    actorName: actor.name,
    at: new Date(),
    link,
  });
  try {
    const recipients = parseEmailList(church.accountingEmails);
    if (recipients.length > 0) {
      await sendEmail({ to: recipients, ...email });
      return;
    }
    await notifyUsersWithRole(
      church.id,
      "ADMIN",
      {
        domain: "giving",
        type: "GIVING_PAYMENT_DETAILS_CHANGED",
        title: "Page de dons : coordonnées modifiées",
        message: `${actor.name} a modifié : ${changes.map((c) => c.label).join(", ")}.`,
        link,
      },
      { email }
    );
  } catch (error) {
    logger.error({ err: error, churchId: church.id }, "Alerte de modification de la page de dons non envoyée");
  }
}
