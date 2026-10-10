import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  resolution: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    // userId du compte à conserver si les deux ont un lien ; null = garder celui du target
    keepUserId: z.string().nullable().optional(),
  }),
});

export const contract = defineContract({
  POST: {
    summary: "Fusion de deux fiches STAR",
    description: "Déplace départements, planning, tâches, présences, discipolat et demandes de liaison vers la cible, puis supprime la source. Si les deux fiches ont un compte lié, `keepUserId` choisit celui conservé. Journalisé.",
    access: "members:manage",
    accessNote: "appelant restreint : les deux fiches entièrement dans son périmètre",
    body: schema,
    response: "`{ merged: true, targetId }`",
  },
});
