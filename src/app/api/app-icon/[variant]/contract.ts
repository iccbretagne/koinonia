import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Icône de l'application, par variante",
    description:
      "Variantes : `icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-180`, `favicon-48`, `badge-96` (suffixe `.png` accepté) ; 404 sinon. Icône déposée (spec 069) : PNG servi depuis la base, cache immuable si `v` est la version en vigueur, 5 minutes sinon. Sans icône déposée : 302 vers le fichier livré avec Koinonia ; sous une icône déposée sans silhouette, le badge redirige vers la cloche générique.",
    access: "public",
    query: z.object({ v: z.string().optional() }),
    response: "Image PNG, ou redirection vers l'icône livrée",
    responseType: "image/png",
  },
});
