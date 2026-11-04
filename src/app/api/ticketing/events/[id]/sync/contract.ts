import { defineContract } from "@/lib/openapi/contract";
import { syncSchema } from "@/modules/ticketing/schemas";

export { syncSchema };

export const contract = defineContract({
  POST: {
    summary: "Synchronisation des opérations de terrain",
    description:
      "File d'opérations d'un appareil (500 au plus) : passages (billet, badge), comptage manuel (+1 / −1 avec motif), ajout sur place, encaissement d'une entrée (accueil) ; remise et vente sur place (restauration). Idempotente par identifiant d'opération : rejouer ne compte rien de plus. Horloge corrigée de l'écart mesuré (`clientTime`). Un passage incohérent est gardé, marqué « anomalie » et signalé à l'organisation ; 90 % et 100 % de la jauge sont notifiés une fois. Chaque opération reçoit `applied`, `duplicate` ou `rejected`.",
    access: "session",
    accessNote: "accueil ou restauration selon l'opération, organisateur",
    body: syncSchema,
    response: "`{ results, counts, capacity, serverTime }`",
  },
});
