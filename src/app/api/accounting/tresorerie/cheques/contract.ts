import { defineContract } from "@/lib/openapi/contract";
import { chequesQuerySchema } from "@/modules/treasury/schemas";

export const contract = defineContract({
  GET: {
    summary: "Chèques encore en caisse",
    description: "Chèques collectés et pas encore remis au compte commun, d'un compte (`accountId`) ou de tous.",
    access: "treasury:manage",
    accessNote: "dans l'église courante",
    query: chequesQuerySchema,
    response: "Chèques",
  },
});
