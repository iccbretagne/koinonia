import { z } from "zod";

/**
 * Champs communs des publications du module emploi (profils de chercheurs, profils et missions
 * freelance) : schémas purs, partagés par les contrats de création et de modification.
 */

export const modalityEnum = z.enum(["REMOTE", "ONSITE", "HYBRID"]);

/** Description et coordonnées de contact d'une publication. */
export const publicationContactFields = {
  description: z.string().min(1),
  contactEmail: z.email().max(150).nullable().optional(),
  contactUrl: z.url().max(500).nullable().optional(),
};

/** Tarifs indicatifs d'une offre freelance (texte libre). */
export const freelanceRateFields = {
  dailyRate: z.string().max(100).nullable().optional(),
  hourlyRate: z.string().max(100).nullable().optional(),
};

const title = z.string().min(1).max(200);
const domain = z.string().min(1).max(150);
const location = z.string().max(150).nullable().optional();
const availableFrom = z.iso.datetime().nullable().optional();

/** Profil freelance : champs saisis à la création comme à la modification. */
export const freelanceProfileFields = { title, domain, ...freelanceRateFields, location, availableFrom, ...publicationContactFields };
/** Mission freelance : idem. */
export const freelanceMissionFields = {
  title,
  domain,
  duration: z.string().max(100).nullable().optional(),
  ...freelanceRateFields,
  location,
  ...publicationContactFields,
};
/** Profil de chercheur d'emploi, sans les cases de type de contrat. */
export const seekerFields = {
  title,
  sector: z.string().max(150).nullable().optional(),
  location,
  availableFrom,
  ...publicationContactFields,
};
