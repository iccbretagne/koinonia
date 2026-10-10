import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const withdrawSchema = z.object({
  eventId: z.string().min(1),
  departmentId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Désistement d'un service (« Je ne peux plus »)",
    description: "Le STAR se désiste d'un service où il est planifié (spec 061) ; la fiche doit être liée au compte appelant, dans l'église de l'événement.",
    access: "planning:view",
    accessNote: "dans l'église de l'événement ; le STAR agit sur sa propre fiche",
    body: withdrawSchema,
    status: 201,
    response: "`{ withdrawal }` : désistement créé",
  },
});
