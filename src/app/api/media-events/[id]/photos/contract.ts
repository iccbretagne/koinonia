import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const patchSchema = z.object({
  photoIds: z.array(z.string()).min(1),
  status: z.enum(["APPROVED", "REJECTED", "PREVALIDATED", "PREREJECTED"]),
});

export const contract = defineContract({
  GET: {
    summary: "Photos d'un événement média",
    access: "media:view",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication (lecture)",
    response: "Liste des photos, de la plus récente à la plus ancienne, avec URL de miniature signée",
  },
  POST: {
    summary: "Dépôt de photos",
    description: "Chaque image est traitée (original et miniature). Une photo en échec n'interrompt pas les autres : elle est signalée dans `errors`. Pour un dépôt direct vers le stockage, voir `POST .../photos/sign` puis `.../photos/confirm`.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication",
    body: { contentType: "multipart/form-data", description: "Une ou plusieurs images dans le champ `files`." },
    response: "`{ uploaded: [{ id, filename }], errors: [{ filename, error }] }`",
    status: 201,
  },
  PATCH: {
    summary: "Validation ou rejet de photos en masse",
    access: "media:review",
    accessNote: "dans l'église de l'événement ; ou équipe Photos (pas la Communication)",
    body: patchSchema,
    response: "`{ updated: n }` : nombre de photos modifiées",
  },
  DELETE: {
    summary: "Suppression de photos",
    description: "Supprime aussi les objets de stockage. Aucune photo trouvée : 404.",
    access: "media:upload",
    accessNote: "dans l'église de l'événement ; ou équipe Photos, ou membre de la Communication",
    query: z.object({ photoIds: z.string().describe("Identifiants des photos, séparés par des virgules") }),
    response: "`{ deleted: n }` : nombre de photos supprimées",
  },
});
