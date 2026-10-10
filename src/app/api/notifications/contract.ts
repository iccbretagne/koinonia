import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const markReadSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Notifications de l'utilisateur connecté",
    access: "session",
    accessNote: "uniquement les notifications de l'appelant",
    response: "`{ notifications, unreadCount }` : les 20 plus récentes et le nombre de non lues",
  },
  PATCH: {
    summary: "Marquage de notifications comme lues",
    description: "`all: true` marque toutes les notifications non lues ; sinon seules celles de `ids` sont marquées. Sans l'un ni l'autre, rien n'est modifié.",
    access: "session",
    accessNote: "uniquement les notifications de l'appelant",
    body: markReadSchema,
    response: "`{ success: true }`",
  },
});
