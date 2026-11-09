import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const listQuerySchema = z.object({
  status: z.enum(["AWAITING", "SUBMITTED", "RETURN_DUE", "SETTLED"]).optional(),
  open: z.enum(["1"]).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Justificatifs après la remise des fonds",
    description:
      "Justifications des demandes versées (spec 078) : attendues, à vérifier, reliquat à rendre ou soldées. La compta voit toutes celles de l'église ; les autres comptes voient celles de leurs demandes et de leur périmètre comptable. `open=1` : toutes sauf soldées.",
    access: "session",
    accessNote: "accounting:view, accounting:submit ou accounting:manage dans l'église courante",
    query: listQuerySchema,
    response: "`JustificationView[]`",
  },
});
