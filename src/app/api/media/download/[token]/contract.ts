import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Médias téléchargeables via un lien de partage",
    description: "Lien lié à un événement : photos approuvées (toutes pour `MEDIA_ALL`). Lien lié à un projet : fichiers validés (`APPROVED`/`FINAL_APPROVED`), ou tous les non-brouillons pour `MEDIA_ALL`.",
    access: "token",
    accessNote: "jeton de partage `MEDIA` ou `MEDIA_ALL`",
    response: "Contenu téléchargeable de l'événement ou du projet",
  },
});
