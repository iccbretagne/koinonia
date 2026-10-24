import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const churchQuery = z.object({ churchId: z.string() });

export const contract = defineContract({
  POST: {
    summary: "Dépôt ou remplacement du logo de la page de dons",
    description:
      "PNG, JPEG ou WebP, 2 Mo au plus (spec 066). 411 sans Content-Length et 413 au-delà de 2,5 Mo, avant lecture du corps. Le format décodé fait foi (un SVG est refusé, 400) ; l'image est réencodée en PNG, métadonnées retirées, 1200 × 600 au plus, sur une nouvelle clé. Enregistré immédiatement, journalisé, et alerte la comptabilité (church.accountingEmails), à défaut les Admins de l'église.",
    access: "giving:manage",
    accessNote: "dans l'église du champ `churchId`",
    body: { contentType: "multipart/form-data", description: "`churchId`, `file` (image)" },
    status: 201,
    response: "Version du logo enregistré (`logoVersion`)",
  },
  DELETE: {
    summary: "Retrait du logo de la page de dons",
    description: "Journalisé, et alerte la comptabilité comme un dépôt (spec 066).",
    access: "giving:manage",
    query: churchQuery,
    response: "`logoVersion: null`",
  },
  GET: {
    summary: "Logo de la page de dons, pour le paramétrage",
    description: "Servi même si la page est inactive, sans cache. 404 sans logo.",
    access: "giving:manage",
    query: churchQuery.extend({ v: z.string().optional() }),
    response: "Image PNG",
    responseType: "image/png",
  },
});
