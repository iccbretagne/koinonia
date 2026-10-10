import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const exportSchema = z.object({
  churchId: z.string().min(1),
  requestIds: z.array(z.string().min(1)).min(1).max(2000),
});

export const contract = defineContract({
  POST: {
    summary: "Export Excel de demandes d'intégration",
    description: "Exporte les demandes désignées (filtres déjà appliqués côté client). L'église est réimposée et les demandes archivées sont exclues. Journalisé.",
    access: "integration:manage",
    accessNote: "ou équipe Intégration/MSDP ; refusé à un berger/co-berger au périmètre restreint",
    body: exportSchema,
    response: "Classeur Excel des demandes",
    responseType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
});
