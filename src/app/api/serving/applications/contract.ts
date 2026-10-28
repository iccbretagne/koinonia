import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const listQuery = z.object({
  churchId: z.string().min(1),
  view: z.enum(["pvs", "department"]).default("pvs"),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des candidatures au service",
    description:
      "Spec 073. Vue `pvs` : toutes les candidatures de l'église, réservée à l'équipe PVS, aux Admins et au Super Admin (403 sinon). Vue `department` : candidatures affectées (ou renvoyées) à un département dont l'appelant est responsable ou Ministre, réduites à ces affectations ; un renvoi reste visible comme trace, sans accès à la fiche (`canOpen: false`).",
    access: "session",
    accessNote: "équipe PVS, `serving:manage`, ou responsable/Ministre d'un département affecté, dans l'église `churchId`",
    query: listQuery,
    response: "Candidatures résumées (identité, statut, onglet, affectations)",
  },
});
