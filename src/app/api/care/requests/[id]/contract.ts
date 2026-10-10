import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Détail d'une demande de rendez-vous pastoral",
    access: "session",
    accessNote: "`care:view` ou `care:qualify` pour la vue d'ensemble ; sinon l'accompagnant en charge, objet par objet",
    response: "Demande, projetée selon les droits du lecteur",
  },
  PATCH: {
    summary: "Action sur une demande de rendez-vous pastoral",
    access: "session",
    accessNote: "valider, affecter, réaffecter, rejeter : `care:qualify` ; étapes de suivi : l'accompagnant en charge",
    body: { contentType: "application/json", description: "Action de transition (`appointmentPatchSchema` du module care) : `action` et ses champs" },
    response: "Demande mise à jour",
  },
  DELETE: {
    summary: "Suppression d'une demande de rendez-vous pastoral",
    access: "care:delete",
    response: "`{ id }`",
  },
});
