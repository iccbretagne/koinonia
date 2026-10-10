import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const DEMAND_TYPES = [
  "AJOUT_EVENEMENT",
  "MODIFICATION_EVENEMENT",
  "ANNULATION_EVENEMENT",
  "MODIFICATION_PLANNING",
  "DEMANDE_ACCES",
] as const;

export const createVisuelSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  type: z.literal("VISUEL"),
  title: z.string().min(1, "Le titre est requis"),
  brief: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  ministryId: z.string().nullable().optional(),
});

export const createDemandSchema = z.object({
  churchId: z.string().min(1, "L'église est requise"),
  type: z.enum(DEMAND_TYPES),
  title: z.string().min(1, "Le titre est requis"),
  payload: z.record(z.unknown()),
  departmentId: z.string().nullable().optional(),
  ministryId: z.string().nullable().optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Liste des demandes d'une église",
    description: "Demandes racines (hors sous-demandes), avec leurs sous-demandes, la fonction destinataire et les départements qui la portent (spec 046). Sans `events:manage`, ou avec `submittedByMe`, seules les demandes de l'appelant sont renvoyées.",
    access: "members:view",
    accessNote: "dans l'église visée ; borné aux demandes de l'appelant sans `events:manage`",
    query: z.object({
      churchId: z.string().describe("Église visée (requis)"),
      type: z.string().optional().describe("Type de demande à filtrer"),
      submittedByMe: z.string().optional().describe("`true` pour ne garder que ses propres demandes"),
    }),
    response: "Liste des demandes, plus récentes d'abord",
  },
  POST: {
    summary: "Création d'une demande",
    description: "Le type du corps choisit le traitement. `VISUEL` : demande de visuel, l'équipe Production Média est notifiée. `AJOUT_EVENEMENT`, `MODIFICATION_EVENEMENT`, `ANNULATION_EVENEMENT`, `MODIFICATION_PLANNING`, `DEMANDE_ACCES` : demande adressée au Secrétariat, qui est notifié. Le département ou le ministère d'origine doit appartenir à l'église (400). Journalisé.",
    access: "session",
    accessNote: "`VISUEL` : `members:view` dans l'église visée ; autres types : `planning:edit` dans l'église visée",
    body: z.union([createVisuelSchema, createDemandSchema]),
    status: 201,
    response: "Demande créée",
  },
});
