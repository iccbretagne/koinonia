import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { churchSettingSchema } from "@/modules/assistant/schemas";

export const contract = defineContract({
  GET: {
    summary: "Assistant de l'église : activé pour l'instance, coupé pour l'église",
    access: "church:settings",
    accessNote: "dans l'église visée",
    params: z.object({ churchId: z.string() }),
    response: "{ instanceEnabled, disabled }",
  },
  PUT: {
    summary: "Couper ou rétablir l'assistant pour l'église",
    description: "Coupé, ses membres voient le lien vers le guide à la place. Journalisé dans l'église.",
    access: "church:settings",
    accessNote: "dans l'église visée",
    params: z.object({ churchId: z.string() }),
    body: churchSettingSchema,
    response: "{ instanceEnabled, disabled }",
  },
});
