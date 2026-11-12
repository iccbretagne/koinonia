import { defineModule } from "@/core/module-registry";

/**
 * Module mcp — connexion des assistants IA à Koinonia (spec 081, ADR-0029).
 *
 * Périmètre :
 *   - Serveur d'autorisation OAuth 2.1 propre à Koinonia : enregistrement dynamique des
 *     clients, code d'autorisation + PKCE, jetons opaques (empreinte seule en base),
 *     rafraîchissement avec rotation, révocation
 *   - Connexions (un compte, une église, un client), interrupteurs d'instance et d'église,
 *     journal des appels sans contenu
 *
 * Les outils MCP sont composés dans `src/app/api/mcp/` à partir des questions de données de
 * l'assistant : ce module n'importe aucun module métier. Aucune permission propre.
 */
export const mcpModule = defineModule({
  name: "mcp",
  version: "1.0.0",
  dependsOn: ["core", "assistant"],

  routes: {
    authenticated: [{ path: "/mcp" }, { path: "/profile/assistants" }, { path: "/admin/mcp" }],
    api: [{ path: "/api/mcp" }],
    public: [
      // Découverte OAuth (RFC 9728, RFC 8414) : lue par les clients avant toute connexion.
      { path: "/.well-known/oauth-protected-resource" },
      { path: "/.well-known/oauth-authorization-server" },
      // Points d'entrée OAuth : sans session NextAuth (le client n'en a pas).
      { path: "/api/mcp/oauth" },
      // Serveur MCP : authentifié par jeton porteur dans le route handler, pas par session.
      { path: "/api/mcp/server" },
    ],
  },
});
