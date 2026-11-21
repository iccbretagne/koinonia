import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Image d'un site d'événement publié",
    description: "Servie seulement si l'image est référencée par la version publiée d'un site actif (église ayant activé les sites, événement hors brouillon) ; sinon 404.",
    query: z.object({ w: z.coerce.number().int().optional().describe("Largeur voulue : 640, 1280 ou 2400 (variante la plus proche par le haut)") }),
    access: "public",
    response: "Image WebP",
    responseType: "image/webp",
  },
});
