import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Détail d'un service à remplacer",
    description: "Écran du responsable (spec 061) : candidats recalculés à chaque lecture. Lecture seule sans `planning:edit` (Secrétaire).",
    access: "planning:department",
    accessNote: "borné au périmètre départemental du désistement",
    response: "Désistement avec ses candidats au remplacement",
  },
  DELETE: {
    summary: "Annulation d'un désistement",
    description: "Possible tant qu'aucun remplaçant n'a été choisi.",
    access: "planning:view",
    accessNote: "uniquement le STAR concerné (403 si le désistement n'est pas le sien)",
    response: "`{ withdrawal }` : désistement annulé",
  },
});
