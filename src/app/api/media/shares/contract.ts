import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Liens de partage actifs de l'église courante",
    description: "Filtrés au périmètre de partage de l'appelant : une collection mixte photos et visuels reste masquée à une équipe qui n'a que l'un des deux périmètres (spec 049). Aucune église sélectionnée : 400.",
    access: "media:manage",
    accessNote: "dans l'église courante ; ou équipe Photos ou Production Média, ou membre de la Communication",
    response: "`{ data: [...] }` : partages actifs",
  },
});
