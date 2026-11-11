import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

/** Paramètres d'une demande d'autorisation (RFC 6749 §4.1.1 + PKCE + RFC 8707). */
export const authorizeQuerySchema = z.object({
  client_id: z.string().min(1).max(100),
  redirect_uri: z.string().min(1).max(500),
  response_type: z.string().max(20),
  code_challenge: z.string().max(128),
  code_challenge_method: z.string().max(10),
  state: z.string().max(500).optional(),
  scope: z.string().max(100).optional(),
  resource: z.string().max(500).optional(),
});

export const decisionSchema = authorizeQuerySchema.extend({
  church_id: z.string().max(100).optional(),
  decision: z.enum(["allow", "deny"]),
});

export const contract = defineContract({
  GET: {
    summary: "MCP : demande d'autorisation d'un assistant IA",
    description:
      "Point d'entrée OAuth : renvoie vers l'écran d'autorisation de Koinonia (après connexion si besoin). Les paramètres sont revérifiés sur l'écran et à la décision.",
    access: "public",
    query: authorizeQuerySchema,
    status: 302,
    response: "Redirection vers l'écran d'autorisation ou la page de connexion",
  },
  POST: {
    summary: "MCP : décision de la personne sur l'écran d'autorisation",
    description:
      "Envoyé par l'écran `/mcp/autoriser`, session requise, même origine (en-tête `Origin` obligatoire). « Autoriser » crée (ou réutilise) la connexion pour l'église choisie — fonction active et rôle dans l'église exigés — avec un code à usage unique ; « Refuser » donne `error=access_denied`. L'écran navigue ensuite vers l'adresse renvoyée.",
    access: "session",
    body: decisionSchema,
    response: "`{ redirectTo }` : adresse de retour de l'assistant, avec `code` et `state` (ou `error`)",
  },
});
