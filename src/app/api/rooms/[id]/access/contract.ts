import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const bodySchema = z.object({ churchId: z.string().min(1) });

export const contract = defineContract({
  GET: {
    summary: "Églises autorisées à réserver une salle",
    access: "rooms:manage",
    accessNote: "dans l'église propriétaire de la salle",
    response: "`{ accesses }` : églises autorisées",
  },
  POST: {
    summary: "Autorisation d'une église sur une salle",
    description: "400 si l'église est la propriétaire de la salle. Opération idempotente. Journalisé.",
    access: "rooms:manage",
    accessNote: "dans l'église propriétaire de la salle",
    body: bodySchema,
    response: "Autorisation créée",
    status: 201,
  },
  DELETE: {
    summary: "Retrait de l'autorisation d'une église sur une salle",
    description: "Journalisé.",
    access: "rooms:manage",
    accessNote: "dans l'église propriétaire de la salle",
    body: bodySchema,
    response: "`{ ok: true }`",
  },
});
