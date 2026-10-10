import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const createSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  recipientId: z.string().min(1, "Le profil pastoral est requis"),
  type: z.enum(["ACTIVITY", "APPOINTMENT"]),
  title: z.string().min(1, "Le titre est requis"),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime("Date de début invalide"),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
}).refine(
  (d) => !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export const contract = defineContract({
  GET: {
    summary: "Entrées de l'agenda pastoral",
    access: "agenda:view",
    query: z.object({
      churchId: z.string(),
      profileId: z.string().optional().describe("Profil pastoral"),
      weekStart: z.string().optional().describe("Lundi de la semaine (AAAA-MM-JJ)"),
    }),
    response: "Entrées de l'agenda, profil pastoral inclus",
  },
  POST: {
    summary: "Création d'une entrée d'agenda",
    description: "Le profil pastoral doit appartenir à l'église. Journalisé.",
    access: "agenda:manage",
    body: createSchema,
    status: 201,
    response: "Entrée créée",
  },
});
