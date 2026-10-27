import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";
import { churchLogoVariantSchema } from "@/modules/core/schemas";

export const churchIdParams = z.object({ churchId: z.string() });
export const variantQuery = z.object({ variant: churchLogoVariantSchema });

export const contract = defineContract({
  GET: {
    summary: "Logo de l'église dans l'interface",
    description:
      "PNG préparé (spec 072), servi aux membres de l'église (rôle ou profil pastoral) et au Super Admin, jamais à une autre église. Cache immuable : l'adresse change à chaque dépôt (`v`). 404 sans logo.",
    access: "session",
    accessNote: "membre de l'église `churchId`",
    params: churchIdParams,
    query: variantQuery.extend({ v: z.string().optional() }),
    response: "Image PNG",
    responseType: "image/png",
  },
  POST: {
    summary: "Dépôt ou remplacement d'un logo de l'église",
    description:
      "PNG, JPEG ou WebP, 2 Mo au plus. 411 sans Content-Length et 413 au-delà de 2,5 Mo, avant lecture du corps. Le format décodé fait foi (un SVG est refusé, 400) ; l'image est réduite à 600 × 200 au plus et réencodée en PNG, métadonnées retirées. Enregistré immédiatement et journalisé dans l'historique de l'église.",
    access: "church:settings",
    params: churchIdParams,
    body: { contentType: "multipart/form-data", description: "`variant` (`light` | `dark`), `file` (image)" },
    status: 201,
    response: "Version du logo enregistré (`version`)",
  },
  DELETE: {
    summary: "Retrait d'un logo de l'église",
    description: "Journalisé. Sans logo pour fond clair, les plumes ICC s'affichent.",
    access: "church:settings",
    params: churchIdParams,
    query: variantQuery,
    response: "`version: null`",
  },
});
