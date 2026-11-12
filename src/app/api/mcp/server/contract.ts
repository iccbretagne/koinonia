import { defineContract } from "@/lib/openapi/contract";

export const contract = defineContract({
  POST: {
    summary: "MCP : serveur des assistants IA (Streamable HTTP, sans état)",
    description:
      "Messages JSON-RPC du protocole MCP (`initialize`, `tools/list`, `tools/call`…). Jeton porteur OAuth requis : sans lui, 401 avec `WWW-Authenticate` qui désigne les métadonnées de la ressource. Outils en lecture seule, filtrés par les droits du compte dans l'église de la connexion ; 60 appels par minute et par compte (429). Chaque appel d'outil est journalisé sans contenu.",
    access: "token",
    accessNote: "jeton d'accès OAuth de Koinonia (spec 081), jamais la session du navigateur",
    body: { contentType: "application/json", description: "Message JSON-RPC 2.0 du protocole MCP" },
    response: "Réponse JSON-RPC",
  },
  GET: { summary: "MCP : non pris en charge (serveur sans état)", access: "public", response: "405 : méthode non prise en charge" },
  DELETE: { summary: "MCP : non pris en charge (serveur sans état)", access: "public", response: "405 : méthode non prise en charge" },
});
