import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

const base64url = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Clé invalide");

export const subscribeSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((value) => value.startsWith("https://"), "L'adresse du service push doit être en https."),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.url().max(2048).optional(),
});

export const contract = defineContract({
  POST: {
    summary: "Abonnement de l'appareil courant aux notifications natives",
    description:
      "Enregistre l'abonnement Web Push de l'appareil pour l'appelant (spec 068, ADR-0024) et pose le cookie httpOnly `koinonia-push-device`, utilisé pour l'oublier à la déconnexion. Un appareil n'appartient qu'à un compte : un endpoint déjà enregistré pour un autre compte est réattribué à l'appelant. 503 si l'instance n'a pas de clés VAPID.",
    access: "session",
    accessNote: "appareils de l'appelant",
    body: subscribeSchema,
    response: "Identifiant de l'abonnement",
    status: 201,
  },
  DELETE: {
    summary: "Désabonnement de l'appareil courant",
    description:
      "Supprime l'abonnement désigné par `endpoint`, à défaut par le cookie `koinonia-push-device`, seulement s'il appartient à l'appelant. Répond 204 dans tous les cas (aucune information sur un abonnement d'autrui).",
    access: "session",
    accessNote: "appareils de l'appelant",
    body: unsubscribeSchema,
    response: "Aucun contenu",
    status: 204,
  },
});
