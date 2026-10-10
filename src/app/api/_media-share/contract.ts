import { z } from "zod";

/** Corps de création d'un lien de partage, commun aux événements et projets média. */
export const shareCreateSchema = z.object({
  type: z.enum(["VALIDATOR", "MEDIA", "MEDIA_ALL", "PREVALIDATOR", "GALLERY"]),
  label: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(),
  onlyApproved: z.boolean().optional(),
});
