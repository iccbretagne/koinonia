import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Domaines dédiés approuvés (usage interne du proxy)",
    description: "Hôte → adresse du site, pour les domaines dédiés approuvés. Lue par le proxy au plus une fois par minute pour remplir son cache ; jamais appelée depuis Internet.",
    access: "token",
    accessNote: "boucle locale uniquement et en-tête `Authorization: Bearer <TRAEFIK_PROVIDER_TOKEN>` (404 si le jeton n'est pas configuré, 403 sinon)",
    response: "Objet `{ \"<hôte>\": \"<adresse du site>\" }`",
  },
});
