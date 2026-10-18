import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { givingPageSchema } from "@/modules/giving/schemas";

export { givingPageSchema };

export const contract = defineContract({
  GET: {
    summary: "Paramètres de la page de dons d'une église",
    description:
      "Contenu enregistré, ou contenu proposé par défaut (page inactive) si la page n'a jamais été configurée. Voir spec 065.",
    access: "giving:manage",
    query: z.object({ churchId: z.string() }),
    response: "Contenu de la page, état configuré, présence d'une adresse comptable et adresse publique",
  },
  PUT: {
    summary: "Enregistrement de la page de dons d'une église",
    description:
      "IBAN vérifié (longueur par pays, clé mod 97), liens en https uniquement, champs obligatoires par section activée (400 sinon). Toute modification est journalisée ; un changement de coordonnées de paiement ou la désactivation de la page alerte la comptabilité (church.accountingEmails), à défaut les Admins de l'église.",
    access: "giving:manage",
    body: givingPageSchema,
    response: "Contenu enregistré",
  },
});
