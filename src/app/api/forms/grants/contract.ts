import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const grantSchema = z.object({ userId: z.string().min(1).max(40) });

export const contract = defineContract({
  GET: {
    summary: "Accès délégués aux formulaires de l'église courante",
    access: "forms:manage",
    response: "Comptes ayant l'accès : nom, email, accordé par, date",
  },
  POST: {
    summary: "Accorder l'accès aux formulaires à un compte",
    description:
      "Le compte doit avoir un rôle dans l'église. Idempotent : un accès déjà accordé ne renotifie pas. Le compte ne voit et ne gère que ses formulaires (et ceux partagés avec lui). Notifié (domaine forms), journalisé.",
    access: "forms:manage",
    body: grantSchema,
    response: "`{ created }`",
    status: 201,
  },
});
