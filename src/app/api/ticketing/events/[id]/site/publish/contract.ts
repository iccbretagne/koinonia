import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "Publication du site",
    description: "Fige le brouillon en version publiée, après nouvelle validation (schéma, lisibilité, images). Le site n'est visible que si l'église a activé les sites et que l'événement n'est plus en brouillon. Journalisé.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    response: "Site publié",
  },
  DELETE: {
    summary: "Dépublication du site",
    description: "Retire la version publiée : le site répond 404. Le brouillon est conservé. Journalisé.",
    access: "session",
    accessNote: "organisateur ou communication de l'événement (rôle `site`)",
    response: "Site dépublié",
  },
});
