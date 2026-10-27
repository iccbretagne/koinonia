import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Retrait immédiat d'un message système",
    description:
      "Le bandeau disparaît tout de suite ; un message programmé ne sera jamais notifié. 400 si le message est déjà terminé ou retiré. Journalisé (spec 071).",
    access: "messages:publish",
    accessNote: "dans l'église du message ; Super Admin pour un message d'instance",
    response: "Message retiré",
  },
});
