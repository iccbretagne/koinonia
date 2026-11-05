import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { purposePatchSchema } from "@/modules/treasury/schemas";

const params = z.object({ id: z.string() });

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'un objet d'offrande spéciale",
    description: "Nom ou `active` (un objet désactivé n'est plus proposé). Journalisée.",
    access: "treasury:manage",
    accessNote: "dans l'église de l'objet",
    params,
    body: purposePatchSchema,
    response: "Objet",
  },
  DELETE: {
    summary: "Suppression d'un objet d'offrande spéciale",
    description: "409 si l'objet est déjà utilisé : il se désactive alors.",
    access: "treasury:manage",
    accessNote: "dans l'église de l'objet",
    params,
    response: "`{ deleted: true }`",
  },
});
