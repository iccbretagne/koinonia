import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Planning hebdomadaire d'un département",
    description: "Événements de la semaine auxquels le département est rattaché, avec les STAR en service, leurs tâches et la consigne du département.",
    access: "planning:department",
    accessNote: "borné au périmètre départemental",
    query: z.object({
      churchId: z.string().describe("Église visée (requis)"),
      weekStart: z.string().describe("Lundi de la semaine, AAAA-MM-JJ (requis)"),
      departmentId: z.string().describe("Département visé (requis)"),
    }),
    response: "Liste d'événements avec `members` (STAR en service et tâches) et `notice` (consigne ou null)",
  },
});
