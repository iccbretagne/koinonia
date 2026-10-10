import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  ministryId: z.string().min(1, "Le ministère est requis"),
});

export const patchFunctionSchema = z.object({
  function: z.string().nullable(),
});

export const contract = defineContract({
  PUT: {
    summary: "Modification d'un département",
    description: "Renomme le département et/ou le déplace vers un autre ministère de la même église. Un département système n'est modifiable que par un Super Admin. Journalisé.",
    access: "departments:manage",
    accessNote: "dans l'église du département ; un Ministre est borné aux départements de son ministère et ne peut déplacer un département que vers son propre ministère",
    body: updateSchema,
    response: "Département mis à jour, avec son ministère",
  },
  PATCH: {
    summary: "Définition de la fonction d'un département",
    description: "Affecte (ou retire avec `null`) la fonction du département (ex. `CAPTATION_AUDIO`). Plusieurs départements peuvent porter la même fonction (spec 046). Un département système n'est modifiable que par un Super Admin. Journalisé.",
    access: "events:manage",
    body: patchFunctionSchema,
    response: "Département avec sa fonction (`id`, `name`, `function`)",
  },
  DELETE: {
    summary: "Suppression d'un département",
    description: "Refusée (400) si le département contient encore des STAR. Un département système n'est supprimable que par un Super Admin. Journalisé.",
    access: "departments:manage",
    accessNote: "dans l'église du département ; un Ministre est borné aux départements de son ministère",
    response: "`{ success: true }`",
  },
});
