import { formatIban, type GivingPageContent } from "@/modules/giving/schemas";

const NAME_PLACEHOLDER = "Prénom Nom";
const EXAMPLE_NAME = "Dupond Marie";

/** Signature proposée tant que l'église n'en a pas saisi d'autre. */
export const DEFAULT_SIGNATURE = "Bénédictions";

type MessageContent = Pick<
  GivingPageContent,
  "transferEnabled" | "beneficiary" | "iban" | "bic" | "transferReference" | "onlineEnabled" | "onlineUrl" | "onsiteEnabled" | "checkPayee"
>;

/** Virement : coordonnées, puis motif à préciser. */
function transferBlocks(c: MessageContent): string[] {
  if (!c.transferEnabled || !c.beneficiary || !c.iban) return [];
  const lines = [c.beneficiary, `IBAN : ${formatIban(c.iban)}`];
  if (c.bic) lines.push(`BIC : ${c.bic}`);
  const blocks = ["Vous pouvez effectuer *un virement bancaire* avec les coordonnées suivantes :", lines.join("\n")];
  if (c.transferReference) blocks.push(`Merci de préciser dans *"Motif du virement"* :\n${c.transferReference}`);
  return blocks;
}

/** Don en ligne ; rappelle le même motif quand un virement le précise. */
function onlineBlocks(c: MessageContent, hasTransfer: boolean, reference: string | null): string[] {
  if (!c.onlineEnabled || !c.onlineUrl) return [];
  const intro = hasTransfer ? "➡ Vous pouvez également utiliser le lien suivant" : "➡ Vous pouvez faire un don en ligne avec le lien suivant";
  const sameReference = reference ? " toujours *en précisant le même motif*" : "";
  return [`${intro}${sameReference} :`, c.onlineUrl];
}

/**
 * Message WhatsApp « Dîmes / Offrandes » tiré de la page de dons enregistrée : seules les
 * sections affichées et complètes y figurent. Mise en forme WhatsApp : `*gras*`.
 */
export function buildWhatsAppMessage(
  content: MessageContent,
  options: { readonly publicUrl?: string | null; readonly signature?: string } = {}
): string {
  const transfer = transferBlocks(content);
  const reference = transfer.length > 0 ? content.transferReference : null;
  const blocks = ["➡ *DÎMES/OFFRANDES*", ...transfer, ...onlineBlocks(content, transfer.length > 0, reference)];

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
