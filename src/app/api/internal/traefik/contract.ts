import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  GET: {
    summary: "Fournisseur HTTP de Traefik (domaines dédiés des sites)",
    description: "Configuration dynamique Traefik : un routeur par domaine dédié approuvé, certificat Let's Encrypt, service vers l'application. Interrogée par Traefik lui-même (provider HTTP) ; jamais depuis Internet.",
    access: "token",
    accessNote: "boucle locale uniquement et en-tête `Authorization: Bearer <TRAEFIK_PROVIDER_TOKEN>` (404 si le jeton n'est pas configuré, 403 sinon)",
    response: "Configuration dynamique Traefik (`http.routers`, `http.services`)",
  },
});
