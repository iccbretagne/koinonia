import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Demandes de rendez-vous pastoral",
    description: "Les coordonnées et le motif sont masqués selon le rôle du lecteur.",
    access: "session",
    accessNote: "vue d'ensemble avec `care:view`/`care:qualify` ; sinon les demandes affectées à ses profils pastoraux",
    query: z.object({
      churchId: z.string(),
      status: z.enum(["PENDING", "VALIDATED", "SCHEDULED", "CLOSED", "REJECTED"]).optional().describe("Défaut tous"),
    }),
    response: "Demandes, projetées selon les droits du lecteur",
  },
  POST: {
    summary: "Demande de rendez-vous pastoral (membre connecté)",
    description: "Limité en débit. Journalisé.",
    access: "planning:view",
    body: { contentType: "application/json", description: "Demande (`appointmentSubmitSchema` du module care) : motifs, détails, disponibilités" },
    status: 201,
    response: "Demande créée",
  },
});
