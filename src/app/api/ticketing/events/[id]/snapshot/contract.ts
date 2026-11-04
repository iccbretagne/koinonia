import { defineContract } from "@/lib/openapi/contract";
import { snapshotQuerySchema } from "@/modules/ticketing/schemas";

export { snapshotQuerySchema };

export const contract = defineContract({
  GET: {
    summary: "Instantané hors ligne d'un écran de terrain",
    description:
      "`reception` : participants (nom, tranche d'âge, entrée à régler, mineur non accompagné et téléphone du responsable), codes de réservation et badges sous forme d'**empreintes**, présences courantes — jamais d'email, de téléphone de contact ni de montant d'option. `catering` : éléments à retirer, état de paiement, codes d'étiquette en empreinte, stock par plat. Aucun jeton : un QR scanné est haché sur l'appareil.",
    access: "session",
    accessNote: "accueil (`reception`) ou restauration (`catering`), organisateur",
    query: snapshotQuerySchema,
    response: "Instantané",
  },
});
