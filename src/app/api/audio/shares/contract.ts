import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const postSchema = z.object({
  slug: z.string().trim().min(1, "Identifiant requis"),
  confirm: z.boolean(),
});

export const contract = defineContract({
  GET: {
    summary: "Partages de bibliothèque de l'église courante",
    access: "audio:manage",
    response: "Églises auxquelles la bibliothèque est partagée et églises qui la partagent",
  },
  POST: {
    summary: "Partage de la bibliothèque avec une autre église",
    description: "Désignée par son adresse publique (slug). Sans `confirm`, renvoie seulement le nom de l'église pour confirmation. Limité en débit, journalisé (spec 036).",
    access: "audio:manage",
    body: postSchema,
    status: 201,
    response: "`{ churchName }` (aperçu) ou partage créé",
  },
});
