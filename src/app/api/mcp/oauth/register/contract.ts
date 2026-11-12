import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const registerSchema = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export const contract = defineContract({
  POST: {
    summary: "MCP : enregistrement dynamique d'un assistant IA (RFC 7591)",
    description:
      "Client public, sans secret ; PKCE obligatoire ensuite. Adresses de redirection en https, ou en boucle locale (http://localhost, 127.0.0.1), sans fragment. 10 enregistrements par minute et par adresse IP.",
    access: "public",
    body: registerSchema,
    status: 201,
    response: "`client_id` et métadonnées du client enregistré",
  },
});
