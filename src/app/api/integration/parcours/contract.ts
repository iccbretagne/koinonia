import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  churchId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  sourceRequestId: z.string().optional(),
  notes: z.string().max(10000).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des dossiers de parcours",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; refusé à un berger/co-berger au périmètre restreint",
    query: z.object({
      churchId: z.string().describe("Église visée"),
      milestone: z.enum(["FAMILY", "PCNC", "STAR", "DISCIPLESHIP"]).optional().describe("Ne garde que les dossiers n'ayant pas encore franchi cette étape"),
      search: z.string().optional().describe("Recherche sur nom, prénom, téléphone, email"),
    }),
    response: "Dossiers, du plus récent au plus ancien, avec leur demande source",
  },
  POST: {
    summary: "Création d'un dossier de parcours",
    description: "Refuse (409) un téléphone ou un email déjà présent dans l'église, ou une demande source déjà rattachée à un dossier. Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; refusé à un berger/co-berger au périmètre restreint",
    body: createSchema,
    status: 201,
    response: "Dossier créé, avec sa demande source",
  },
});
