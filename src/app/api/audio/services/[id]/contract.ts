import { z } from "zod";
import { defineContract } from "@/lib/openapi/contract";

export const updateSchema = z.object({
  title: z.string().nullable().optional(),
  speaker: z.string().optional(),
  serviceDate: z.string().datetime().optional(),
  planningEventId: z.string().nullable().optional(),
  coverKey: z.string().nullable().optional(),
  series: z.string().min(1).nullable().optional(),
  // Même contrainte que Event.type (src/app/api/events/route.ts) : EVENT_TYPES est une
  // contrainte d'interface (le Select), pas une contrainte serveur.
  type: z.string().min(1).optional(),
});

export const contract = defineContract({
  GET: {
    summary: "Détail d'un culte audio",
    access: "audio:view",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    response: "Culte avec sources, séquences et rendus",
  },
  PATCH: {
    summary: "Modification des métadonnées d'un culte audio",
    access: "audio:review",
    accessNote: "Passe aussi pour un membre d'un département de fonction `CAPTATION_AUDIO` (`requireAudioAccess`)",
    body: updateSchema,
    response: "Culte mis à jour",
  },
  DELETE: {
    summary: "Suppression d'un culte audio",
    access: "audio:manage",
    accessNote: "`audio:manage`, ou responsable/ministre d'un département de captation audio (`requireAudioUnpublishAccess`)",
    response: "`{ deleted: id }`",
  },
});
