import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Recherche d'utilisateurs à lier à une fiche STAR",
    description: "Retourne les comptes non encore liés à un STAR dans l'église (10 au plus). Par nom : seulement parmi les utilisateurs déjà rattachés à cette église (rôle ou demande de liaison). Par email : correspondance exacte sur toute la plateforme (spec 037). Moins de 2 caractères : liste vide.",
    access: "access:manage",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      q: z.string().optional().describe("Nom, nom d'affichage ou email exact (2 caractères minimum)"),
    }),
    response: "Utilisateurs trouvés (`id`, `name`, `displayName`, `image`)",
  },
});
