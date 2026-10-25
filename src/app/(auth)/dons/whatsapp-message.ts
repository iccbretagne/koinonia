import { formatIban, type GivingPageContent } from "@/modules/giving/schemas";

const NAME_PLACEHOLDER = "Prénom Nom";
const EXAMPLE_NAME = "Dupond Marie";

/** Signature proposée tant que l'église n'en a pas saisi d'autre. */
export const DEFAULT_SIGNATURE = "Bénédictions";

type MessageContent = Pick<
  GivingPageContent,
  "transferEnabled" | "beneficiary" | "iban" | "bic" | "transferReference" | "onlineEnabled" | "onlineUrl" | "onsiteEnabled" | "checkPayee"
>;

/**
 * Message WhatsApp « Dîmes / Offrandes » tiré de la page de dons enregistrée : seules les
 * sections affichées et complètes y figurent. Mise en forme WhatsApp : `*gras*`.
 */
export function buildWhatsAppMessage(
  content: MessageContent,
  options: { readonly publicUrl?: string | null; readonly signature?: string } = {}
): string {
  const blocks: string[] = ["➡ *DÎMES/OFFRANDES*"];
  const transfer = content.transferEnabled && content.beneficiary && content.iban;
  const reference = transfer ? content.transferReference : null;

  if (transfer) {
    const lines = [content.beneficiary, `IBAN : ${formatIban(content.iban!)}`];
    if (content.bic) lines.push(`BIC : ${content.bic}`);
    blocks.push("Vous pouvez effectuer *un virement bancaire* avec les coordonnées suivantes :", lines.join("\n"));
    if (reference) blocks.push(`Merci de préciser dans *"Motif du virement"* :\n${reference}`);
  }

  if (content.onlineEnabled && content.onlineUrl) {
    const intro = transfer ? "➡ Vous pouvez également utiliser le lien suivant" : "➡ Vous pouvez faire un don en ligne avec le lien suivant";
    const sameReference = reference ? " toujours *en précisant le même motif*" : "";
    blocks.push(`${intro}${sameReference} :`, content.onlineUrl);
  }

  if (reference?.includes(NAME_PLACEHOLDER)) {
    blocks.push(`*Exemple dans le motif du virement* :\n${reference.replace(NAME_PLACEHOLDER, EXAMPLE_NAME)}`);
  }

  if (content.onsiteEnabled && content.checkPayee) {
    blocks.push(
      `➡ Au culte, chèques et espèces sont à mettre dans *l'enveloppe remise par l'équipe d'accueil* (chèques à l'ordre de *${content.checkPayee}*).`
    );
  }

  if (options.publicUrl) blocks.push(`Toutes les façons de donner :\n${options.publicUrl}`);

  const signature = (options.signature ?? DEFAULT_SIGNATURE).trim();
  if (signature) blocks.push(signature);
  return blocks.join("\n\n");
}

/** Lien de partage WhatsApp (choix du destinataire dans l'application). */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
