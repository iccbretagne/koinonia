import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  churchId: z.string().min(1, "L'ID de l'église est requis"),
});

export const contract = defineContract({
  POST: {
    summary: "Choix de l'église courante",
    description: "Enregistre l'église dans un cookie valable 30 jours.",
    access: "session",
    accessNote: "l'appelant doit avoir un rôle ou un accès pastoral dans l'église visée (403 sinon)",
    body: schema,
    response: "`{ churchId }`",
  },
});
