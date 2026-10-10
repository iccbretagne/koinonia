import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const delay = z.number().int().min(1).max(365);

export const schema = z.object({
  churchId: z.string().min(1),
  recontactDelayDays: delay,
  missionDelayDays: delay,
});

export const contract = defineContract({
  GET: {
    summary: "Délais de relance de l'intégration",
    description: "Délais avant relance des demandes en attente (spec 051).",
    access: "integration:manage",
    accessNote: "ou responsable d'un département de fonction INTEGRATION ; un simple membre de l'équipe ou un berger est refusé",
    query: z.object({ churchId: z.string().describe("Église visée") }),
    response: "Réglages de l'église (délais de recontact et de mission, en jours)",
  },
  PUT: {
    summary: "Modification des délais de relance",
    access: "integration:manage",
    accessNote: "ou responsable d'un département de fonction INTEGRATION",
    body: schema,
    response: "Réglages mis à jour",
  },
});
