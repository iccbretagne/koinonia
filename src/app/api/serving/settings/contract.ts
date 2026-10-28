import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { settingsSchema } from "@/modules/serving/schemas";

export { settingsSchema };

export const settingsQuery = z.object({ churchId: z.string().min(1) });

export const contract = defineContract({
  GET: {
    summary: "Réglages des candidatures au service",
    description: "Spec 073. Valeurs par défaut (observation 3 mois, conservation 12 mois) tant que rien n'est enregistré.",
    access: "session",
    accessNote: "Super Admin, `serving:manage` ou responsable d'un département PVS, dans l'église `churchId`",
    query: settingsQuery,
    response: "Durées et adresse email de chaque département PVS",
  },
  PUT: {
    summary: "Modification des réglages des candidatures",
    description:
      "Spec 073. La durée d'observation ne s'applique qu'aux accueils suivants. Les adresses email ne peuvent viser qu'un département PVS de l'église (400 sinon). Journalisé.",
    access: "session",
    accessNote: "Super Admin, `serving:manage` ou responsable d'un département PVS, dans l'église `churchId`",
    body: settingsSchema,
    response: "Réglages enregistrés",
  },
});
