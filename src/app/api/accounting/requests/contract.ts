import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  type:          z.enum(["EXPENSE_REPORT", "BUDGET_ADVANCE"]),
  label:         z.string().min(1).max(200),
  description:   z.string().optional(),
  amount:        z.number().positive(),
  departmentId:  z.string().min(1).optional(), // null/omis = note de frais personnelle
  attachmentIds: z.array(z.string()).optional(),
  correctionOfId: z.string().min(1).optional(), // demande rejetée que celle-ci corrige
});

export const contract = defineContract({
  GET: {
    summary: "Liste des demandes financières",
    description: "Le filtre `departmentId` restreint le périmètre autorisé, il ne l'élargit jamais.",
    access: "accounting:view",
    accessNote: "dans l'église courante ; un responsable ne voit que son périmètre et ses propres demandes",
    query: z.object({
      status: z.string().optional(),
      departmentId: z.string().optional(),
      type: z.string().optional(),
    }),
    response: "Demandes avec département, demandeur, pièces et paiements",
  },
  POST: {
    summary: "Soumission d'une demande financière",
    description: "Une correction ne peut porter que sur sa propre demande rejetée. Les comptables sont notifiés (domaine `accounting`) et les adresses comptables de l'église reçoivent un email.",
    access: "accounting:submit",
    accessNote: "dans l'église courante",
    body: createSchema,
    status: 201,
    response: "Demande créée",
  },
});
