import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED", "REVISION_REQUESTED"]),
  comment: z.string().max(2000).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "URL signée de la version courante d'un visuel à valider",
    description: "Le jeton doit être lié à un projet média, sinon 403. Le fichier doit appartenir au projet ; sinon 404.",
    access: "token",
    accessNote: "jeton de partage `VALIDATOR` ou `PREVALIDATOR` d'un projet média",
    response: "`{ id, originalUrl, filename }` : URL signée de la dernière version",
  },
  PATCH: {
    summary: "Validation, rejet ou demande de révision d'un visuel via un lien de partage",
    description: "Un prévalidateur ne peut poser que `PREVALIDATED`, `PREREJECTED` ou `REVISION_REQUESTED` ; un validateur que `APPROVED`, `REJECTED` ou `REVISION_REQUESTED` (sinon 403). Un commentaire éventuel est enregistré, signé du libellé du lien. Le fichier doit appartenir au projet du jeton.",
    access: "token",
    accessNote: "jeton de partage `VALIDATOR` ou `PREVALIDATOR` d'un projet média",
    body: patchSchema,
    response: "Fichier média mis à jour",
  },
});
