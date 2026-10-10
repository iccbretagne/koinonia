import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  integratedInFamily: z.boolean().optional(),
  familyIntegratedAt: z.string().datetime().optional().nullable(),
  followsPcnc: z.boolean().optional(),
  pcncStartedAt: z.string().datetime().optional().nullable(),
  isStar: z.boolean().optional(),
  starSince: z.string().datetime().optional().nullable(),
  inDiscipleship: z.boolean().optional(),
  discipleshipSince: z.string().datetime().optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un dossier de parcours",
    access: "integration:manage",
    accessNote: "dans l'église du dossier ; ou équipe Intégration/MSDP ; refusé à un berger/co-berger au périmètre restreint",
    response: "Dossier avec sa demande source et le suivi MSDP éventuel",
  },
  PATCH: {
    summary: "Mise à jour d'un dossier de parcours",
    description: "Cocher une étape sans date la date à aujourd'hui. Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; refusé à un berger/co-berger au périmètre restreint",
    body: patchSchema,
    response: "Dossier mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un dossier de parcours",
    description: "Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; refusé à un berger/co-berger au périmètre restreint",
    response: "`{ id }`",
  },
});
