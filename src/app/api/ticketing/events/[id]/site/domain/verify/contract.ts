import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Vérification DNS du domaine dédié",
    description: "Contrôle l'enregistrement TXT `_koinonia.<domaine>` (jeton de preuve) et que le domaine pointe vers Koinonia (CNAME, ou mêmes adresses). Réussite : « vérifié » (le Super Admin doit encore l'approuver) ; échec : le motif est renvoyé dans `lastError`.",
    access: "session",
    accessNote: "organisateur de l'événement (rôle `configure`)",
    response: "Domaine avec son nouvel état",
  },
});
