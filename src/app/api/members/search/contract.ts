import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Recherche de fiches STAR non liées (onboarding)",
    description:
      "Autocomplétion pour un nouvel arrivant sur /no-access : aucun accès à l'église n'est requis. Ne renvoie que les fiches non liées à un compte, avec nom et département principal (ni email ni téléphone). " +
      "Classement flou par pertinence ; moins de 2 caractères, la liste est vide.",
    access: "session",
    accessNote: "toute personne connectée, sans rôle dans l'église visée",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      q: z.string().optional().describe("Texte recherché (2 caractères minimum)"),
    }),
    response: "Jusqu'à 10 fiches `{ id, firstName, lastName, departments, matchStrength }`",
  },
});
