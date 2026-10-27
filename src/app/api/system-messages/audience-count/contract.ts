import { defineContract } from "@/lib/openapi/contract";
import { audienceCountSchema } from "@/modules/messages/schemas";

export { audienceCountSchema };

export const contract = defineContract({
  POST: {
    summary: "Décompte du public d'un message système, avant publication",
    description:
      "Nombre de comptes visés, et nombre de fiches STAR concernées sans compte lié, qui ne recevront pas le message (spec 071). Rien n'est enregistré.",
    access: "messages:publish",
    accessNote: "dans l'église visée ; Super Admin pour toute l'instance",
    body: audienceCountSchema,
    response: "`{ recipients, membersWithoutAccount }`",
  },
});
