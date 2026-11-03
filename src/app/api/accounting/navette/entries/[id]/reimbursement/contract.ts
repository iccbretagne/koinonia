import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const params = z.object({ id: z.string() });

export const contract = defineContract({
  POST: {
    summary: "Demande de remboursement d'une avance personnelle",
    description:
      "Crée une note de frais dans la comptabilité au nom de l'auteur de la dépense (même STAR), rattachée au département Navette, avec le montant et une copie du justificatif ; elle suit le circuit habituel et prévient la comptabilité. Seulement pour une dépense « avance personnelle » de l'appelant, sans demande en cours (409). La ligne n'est plus modifiable par l'équipe ensuite (spec 073, lien A).",
    access: "session",
    accessNote: "auteur de la ligne, membre de l'équipe navette ou gestionnaire, dans l'église de la ligne",
    params,
    status: 201,
    response: "`{ requestId }`",
  },
  DELETE: {
    summary: "Annulation de la demande de remboursement",
    description: "Possible tant que la comptabilité ne l'a pas prise en charge (409 sinon).",
    access: "session",
    accessNote: "auteur de la ligne, dans l'église de la ligne",
    params,
    response: "`{ cancelled: true }`",
  },
});
