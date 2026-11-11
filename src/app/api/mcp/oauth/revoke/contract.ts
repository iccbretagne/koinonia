import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const revokeSchema = z.object({
  token: z.string().min(1),
  client_id: z.string().optional(),
  token_type_hint: z.string().optional(),
});

export const contract = defineContract({
  POST: {
    summary: "MCP : révocation d'un jeton par l'assistant (RFC 7009)",
    description: "Révoque toute la connexion du jeton présenté. Répond 200 même si le jeton est inconnu.",
    access: "public",
    body: { contentType: "application/x-www-form-urlencoded", description: "`token`, `client_id` facultatif" },
    response: "Vide",
  },
});
