import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const onboardSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  slug: z
    .string()
    .min(1, "L'identifiant est requis")
    .regex(/^[a-z0-9-]+$/, "L'identifiant ne peut contenir que des lettres minuscules, chiffres et tirets"),
  adminEmail: z.string().email("Email invalide").optional().or(z.literal("")),
});

export const contract = defineContract({
  POST: {
    summary: "Onboarding d'une nouvelle église",
    description: "Crée l'église, son ministère et son département système « Sans département », attribue le rôle Admin à `adminEmail` (compte créé si besoin) et le rôle Super Admin à l'appelant. 409 si le slug est déjà pris. Limité en débit. Journalisé.",
    access: "superAdmin",
    body: onboardSchema,
    response: "Église créée",
    status: 201,
  },
});
