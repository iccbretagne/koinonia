import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const deleteSchema = z.object({ churchId: z.string() });

export const contract = defineContract({
  DELETE: {
    summary: "Suppression d'un compte jamais activé",
    description: "Réservée aux comptes pré-provisionnés qui n'ont jamais terminé de connexion Google et ne portent aucun rôle dans une autre église (spec 047). Ne couvre pas la suppression d'un utilisateur en général. Journalisé.",
    access: "users:manage",
    accessNote: "dans l'église indiquée dans le corps",
    body: deleteSchema,
    response: "`{ deleted: true }`",
  },
});
