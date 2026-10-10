import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

function isValidDate(val: string) {
  return !Number.isNaN(new Date(val).getTime());
}

export const updateSchema = z
  .object({
    title: z.string().trim().min(1, "Le titre est requis").max(200),
    startsAt: z.string().min(1, "La date de début est requise").refine(isValidDate, "Date de début invalide"),
    endsAt: z.string().min(1, "La date de fin est requise").refine(isValidDate, "Date de fin invalide"),
    location: z.string().trim().max(200).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    scope: z.enum(["occurrence", "following"]).default("occurrence"),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "L'heure de fin doit être postérieure à l'heure de début",
    path: ["endsAt"],
  });

export const contract = defineContract({
  PUT: {
    summary: "Modification d'un événement d'équipe",
    description: "S'applique à l'occurrence seule ou aux suivantes selon `scope` (spec 044). Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental du département de l'événement",
    body: updateSchema,
    response: "`{ updated }` : nombre d'occurrences modifiées",
  },
  DELETE: {
    summary: "Suppression d'un événement d'équipe",
    description: "Journalisé.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental du département de l'événement",
    query: z.object({ scope: z.enum(["occurrence", "following"]).optional().describe("`following` pour supprimer aussi les occurrences suivantes ; sinon l'occurrence seule") }),
    response: "`{ deleted }` : nombre d'occurrences supprimées",
  },
});
