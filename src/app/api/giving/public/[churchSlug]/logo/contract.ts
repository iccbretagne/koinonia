import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Logo public de la page de dons d'une église",
    description:
      "Servi seulement si la page est active et a un logo (404 sinon, même réponse qu'une église inconnue). Cache immuable : le paramètre `v` change à chaque dépôt (spec 066).",
    access: "public",
    query: z.object({ v: z.string().optional() }),
    response: "Image PNG",
    responseType: "image/png",
  },
});
