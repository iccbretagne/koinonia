import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Statistiques comptables",
    access: "accounting:stats",
    query: z.object({
      churchId: z.string(),
      period: z.enum(["month", "quarter", "year"]).optional().describe("Défaut year"),
    }),
    response: "Montants par période, type et département",
  },
});
