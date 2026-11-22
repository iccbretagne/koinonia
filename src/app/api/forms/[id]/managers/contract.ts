import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const managerSchema = z.object({ userId: z.string().min(1).max(40) });

export const contract = defineContract({
  GET: {
    summary: "Co-gestionnaires d'un formulaire",
    access: "forms:manage",
    accessNote: "ou auteur / co-gestionnaire avec accès délégué, dans l'église du formulaire",
    response: "Comptes avec qui le formulaire est partagé : nom, email, ajouté par, date",
  },
  POST: {
    summary: "Partager un formulaire avec un compte",
    description:
      "Réservé à l'auteur et à `forms:manage`. Le compte doit avoir l'accès délégué ou `forms:manage` dans l'église. Idempotent. Le co-gestionnaire fait tout sauf supprimer le formulaire et gérer le partage. Notifié, journalisé.",
    access: "forms:manage",
    accessNote: "ou auteur du formulaire avec accès délégué",
    body: managerSchema,
    response: "`{ created }`",
    status: 201,
  },
});
