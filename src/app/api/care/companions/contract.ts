import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const putSchema = z.object({
  churchId: z.string().min(1),
  userId: z.string().min(1),
  state: z.enum(["ADDED", "EXCLUDED", "DEFAULT"]),
});

export const contract = defineContract({
  GET: {
    summary: "Accompagnants possibles",
    access: "care:qualify",
    query: z.object({
      churchId: z.string(),
    }),
    response: "`{ profiles, members }` : profils pastoraux et membres des départements MSDP",
  },
  PUT: {
    summary: "Ajout ou exclusion d'un accompagnant",
    description: "`ADDED` ajoute un compte à la liste, `EXCLUDED` l'en retire, `DEFAULT` revient à la règle par défaut.",
    access: "care:qualify",
    body: putSchema,
    response: "État enregistré",
  },
});
