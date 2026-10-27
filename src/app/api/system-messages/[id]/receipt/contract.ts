import { defineContract } from "@/lib/openapi/contract";
import { receiptSchema } from "@/modules/messages/schemas";

export { receiptSchema };

export const contract = defineContract({
  POST: {
    summary: "Message système vu ou fermé",
    description:
      "`seen` : affichage du bandeau ou ouverture du détail ; `dismiss` : fermeture du bandeau, sur tous les appareils de la personne. Idempotent. Réservé au public du message (404 sinon) ; un message Urgent ne se ferme pas (400). Alimente les statistiques globales (spec 071).",
    access: "session",
    accessNote: "personne du public du message",
    body: receiptSchema,
    status: 204,
    response: "Aucun contenu",
  },
});
