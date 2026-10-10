import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Doublons probables de fiches STAR",
    access: "members:manage",
    accessNote: "borné au périmètre de l'appelant",
    query: z.object({
      churchId: z.string(),
    }),
    response: "Groupes de fiches candidates (email, nom)",
  },
});
