import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  DELETE: {
    summary: "Retirer l'accès aux formulaires d'un compte",
    description:
      "Les formulaires du compte restent en ligne ; ses partages sont suspendus et reviennent si l'accès est rendu. Notifié (domaine forms), journalisé.",
    access: "forms:manage",
    response: "`{ deleted: true }`",
  },
});
