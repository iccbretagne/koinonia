import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { createSchema } from "@/modules/messages/schemas";

export { createSchema };

export const contract = defineContract({
  GET: {
    summary: "Messages système d'une église",
    description:
      "Messages de l'église et messages pour toute l'instance (en lecture seule hors Super Admin), du plus récent au plus ancien, avec leur état (programmé, en cours, passé) et leurs statistiques : comptes notifiés, vus, fermés — sans liste nominative (spec 071).",
    access: "messages:publish",
    accessNote: "dans l'église du paramètre `churchId`",
    query: z.object({ churchId: z.string() }),
    response: "Liste des messages avec `stats` et `readOnly`",
  },
  POST: {
    summary: "Publication d'un message système",
    description:
      "`scope: \"church\"` (avec `churchId`) ou `\"instance\"` (Super Admin). Public par rôles, ministères et départements (responsables seulement en option) ; ministères et départements de l'église du message ; public vide refusé (400). Fin obligatoire, après le début et dans le futur, 90 jours au plus. Un message qui commence tout de suite est notifié aussitôt (cloche, email et appareil selon les préférences « Messages de l'administration ») ; un message Urgent part par email malgré la préférence (ADR-0025). Journalisé.",
    access: "messages:publish",
    accessNote: "dans l'église visée ; Super Admin pour toute l'instance",
    body: createSchema,
    status: 201,
    response: "Message créé",
  },
});
