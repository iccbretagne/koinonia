/** Lien de partage WhatsApp : ouvre WhatsApp avec le message, le destinataire se choisit dans l'application. */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
