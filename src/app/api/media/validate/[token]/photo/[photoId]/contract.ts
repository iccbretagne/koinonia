import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED"]),
});

export const contract = defineContract({
  GET: {
    summary: "URL de l'original d'une photo à valider",
    description: "Le jeton doit être lié à un événement média, sinon 404.",
    access: "token",
    accessNote: "jeton de partage `VALIDATOR` ou `PREVALIDATOR` d'un événement média",
    response: "`{ id, originalUrl, filename }`",
  },
  PATCH: {
    summary: "Validation ou rejet d'une photo via un lien de partage",
    description: "Un prévalidateur ne peut que prévalider ou écarter (`PREVALIDATED`, `PREREJECTED`), un validateur qu'approuver ou rejeter (`APPROVED`, `REJECTED`), sinon 403. Quand un validateur épuise les photos en attente, l'événement passe automatiquement en `REVIEWED`.",
    access: "token",
    accessNote: "jeton de partage `VALIDATOR` ou `PREVALIDATOR` d'un événement média",
    body: patchSchema,
    response: "`{ id, status }`",
  },
});
