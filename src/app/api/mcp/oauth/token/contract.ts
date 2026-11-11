import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const tokenSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    code_verifier: z.string().min(43).max(128),
    redirect_uri: z.string().min(1),
    client_id: z.string().min(1),
    resource: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
    client_id: z.string().min(1),
    resource: z.string().optional(),
  }),
]);

export const contract = defineContract({
  POST: {
    summary: "MCP : jetons d'accès (code d'autorisation ou rafraîchissement)",
    description:
      "Corps `application/x-www-form-urlencoded` (ou JSON). Code à usage unique, PKCE S256 vérifié, `redirect_uri` identique à l'autorisation ; un code ou un jeton de rafraîchissement rejoué révoque la connexion. Accès 1 h, rafraîchissement 90 jours glissants avec rotation. Erreurs au format OAuth (`invalid_grant`…).",
    access: "public",
    body: { contentType: "application/x-www-form-urlencoded", description: "Paramètres OAuth 2.1 (`grant_type`, `code`, `code_verifier`, `redirect_uri`, `client_id` ou `refresh_token`)" },
    response: "`access_token`, `refresh_token`, `expires_in`, `token_type`, `scope`",
  },
});
