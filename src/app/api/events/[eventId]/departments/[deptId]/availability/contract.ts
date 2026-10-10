import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const schema = z.object({ action: z.enum(["ask", "relance"]) });

export const contract = defineContract({
  POST: {
    summary: "Interrogation ou relance de l'équipe sur ses disponibilités",
    description: "`ask` interroge l'équipe du département, `relance` relance les sans-réponse (spec 058) ; la relance manuelle n'est possible qu'une fois par jour. 404 si le département n'est pas lié à l'événement.",
    access: "planning:edit",
    accessNote: "borné au périmètre départemental",
    body: schema,
    response: "Résultat de l'envoi (interrogation ou relance)",
  },
});
