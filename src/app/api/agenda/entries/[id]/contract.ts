import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().nullable().optional(),
}).refine(
  (d) => !(d.startsAt && d.endsAt) || new Date(d.endsAt) > new Date(d.startsAt),
  { message: "L'heure de fin doit être après l'heure de début", path: ["endsAt"] }
);

export const contract = defineContract({
  PATCH: {
    summary: "Modification d'une entrée d'agenda",
    description: "Journalisé.",
    access: "agenda:manage",
    body: updateSchema,
    response: "Entrée mise à jour",
  },
  DELETE: {
    summary: "Suppression d'une entrée d'agenda",
    description: "Journalisé.",
    access: "agenda:manage",
    response: "`{ success: true }`",
  },
});
