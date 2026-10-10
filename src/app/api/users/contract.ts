import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Liste des utilisateurs d'une église",
    description: "Chaque utilisateur porte ses rôles dans l'église et l'indicateur `neverConnected` (aucune connexion Google terminée, spec 047).",
    access: "users:manage",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "Utilisateurs ayant un rôle dans l'église, triés par nom",
  },
});
