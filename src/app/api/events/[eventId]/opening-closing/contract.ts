import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  slot: z.enum(["OPENING", "CLOSING"]),
  memberId: z.string().min(1),
  note: z.string().max(500).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Ouverture et fermeture d'un événement",
    access: "planning:view",
    accessNote: "dans l'église de l'événement",
    response: "`{ opening, closing }` : désignations avec le membre concerné",
  },
  POST: {
    summary: "Désignation d'un service d'ouverture ou de fermeture",
    description: "Le membre doit appartenir à l'église (404). Il est notifié de sa désignation ; `absenceWarning` signale une absence « tous départements » couvrant la date de l'événement (spec 050).",
    access: "planning:view",
    accessNote: "et droit de désigner ce service : Super Admin, Admin, Secrétaire, responsable d'un département Sécurité ou membre d'un département Secrétariat (403 sinon)",
    body: createSchema,
    status: 201,
    response: "`{ assignment, absenceWarning }`",
  },
});
