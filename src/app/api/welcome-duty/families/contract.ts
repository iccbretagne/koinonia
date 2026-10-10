import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  familyId:   z.number().int().positive(),
  familyName: z.string().min(1).max(100),
});

export const contract = defineContract({
  GET: {
    summary: "Pool des familles de permanence d'accueil",
    description: "Familles actives par défaut, avec leur dernière affectation ; triées par nom.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    query: z.object({ active: z.string().optional().describe("`false` pour inclure les familles désactivées") }),
    response: "Liste des familles du pool avec leur dernière affectation",
  },
  POST: {
    summary: "Ajout d'une famille au pool",
    description: "Réactive la famille si elle était désactivée (200) ; 409 si elle est déjà active dans le pool.",
    access: "events:manage",
    accessNote: "dans l'église courante",
    body: createSchema,
    status: 201,
    response: "Famille ajoutée (ou réactivée)",
  },
});
