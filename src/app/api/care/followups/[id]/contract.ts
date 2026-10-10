import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Détail d'un suivi MSDP",
    access: "session",
    accessNote: "`care:view` ou `care:qualify` pour la vue d'ensemble ; sinon l'accompagnant en charge, objet par objet",
    response: "Suivi MSDP",
  },
  PATCH: {
    summary: "Action sur un suivi MSDP",
    access: "session",
    accessNote: "affecter, réaffecter, rejeter : `care:qualify` ; fixer la date, compte rendu, rendre au référent : l'accompagnant en charge",
    body: { contentType: "application/json", description: "Action de transition (`msdpPatchSchema` du module care) : `action` et ses champs" },
    response: "Suivi mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un suivi MSDP",
    access: "care:delete",
    response: "`{ id }`",
  },
});
