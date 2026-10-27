import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Manifeste de l'application installable (PWA)",
    description:
      "Nom, adresse de démarrage, couleurs et icônes de l'application (spec 069). Les icônes pointent vers `/api/app-icon/<variante>.png?v=<version>` : un changement d'icône change leur adresse. Cache de 5 minutes.",
    access: "public",
    query: z.object({ v: z.string().optional() }),
    response: "Manifeste Web App",
    responseType: "application/manifest+json",
  },
});
