import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const replaceSchema = z.object({ memberId: z.string().min(1) });

export const contract = defineContract({
  POST: {
    summary: "Choix d'un remplaçant pour un désistement",
    description: "Spec 061. Le STAR remplacé reçoit sa confirmation.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental du désistement",
    body: replaceSchema,
    response: "`{ withdrawal }` : désistement pourvu",
  },
});
