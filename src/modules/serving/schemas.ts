import { z } from "zod";

/**
 * Schémas purs du module serving (spec 073) : importables par les contrats d'API, les routes et
 * les composants client, sans dépendance serveur.
 */

/** Formations PCNC proposées dans les églises ICC (formulaire de Jenny). */
export const PCNC_TRAININGS = ["001", "101", "201", "RTT", "ACB", "IEBI"] as const;

export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const;

export const MARITAL_STATUS_LABEL: Record<(typeof MARITAL_STATUSES)[number], string> = {
  SINGLE: "Célibataire",
  MARRIED: "Marié(e)",
  DIVORCED: "Divorcé(e)",
  WIDOWED: "Veuf / Veuve",
};

/** Poids maximal de la photo déposée. */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string): Date | null {
  if (!DAY_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  // Rejette les dates impossibles (2026-02-31 devient mars en JS)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** Texte libre facultatif : un champ vide du formulaire devient `null`. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .optional()
    .transform((v) => (v ? v : null));

/** Question Oui/Non : sans réponse → `null` (« Non renseigné »), jamais « Non ». */
const yesNo = z
  .enum(["oui", "non", ""])
  .optional()
  .transform((v) => (v === "oui" ? true : v === "non" ? false : null));

const pastDay = (message: string) =>
  z
    .string()
    .transform((v, ctx) => {
      const date = parseDay(v);
      if (!date || date.getTime() > Date.now()) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return date;
    });

const optPastDay = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = parseDay(v);
    if (!date || date.getTime() > Date.now()) {
      ctx.addIssue({ code: "custom", message: "Date invalide" });
      return z.NEVER;
    }
    return date;
  });

/**
 * Fiche de candidature telle que reçue du formulaire public (champs texte du multipart). Les
 * formations PCNC arrivent en plusieurs valeurs du même nom et sont passées en tableau.
 */
export const applicationFormSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis").max(100, "100 caractères maximum"),
  lastName: z.string().trim().min(1, "Le nom est requis").max(100, "100 caractères maximum"),
  birthDate: pastDay("Date de naissance invalide"),
  profession: optText(150),
  maritalStatus: z
    .enum([...MARITAL_STATUSES, ""])
    .optional()
    .transform((v) => (v ? v : null)),
  childrenCount: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 30) {
        ctx.addIssue({ code: "custom", message: "Nombre entre 0 et 30" });
        return z.NEVER;
      }
      return n;
    }),
  street: optText(200),
  city: optText(100),
  postalCode: optText(20),
  country: optText(100),
  phone: optText(30),
  email: z
    .union([z.literal(""), z.email("Adresse e-mail invalide").max(200)])
    .optional()
    .transform((v) => (v ? v : null)),
  baptized: yesNo,
  baptismDate: optPastDay,
  baptismPlace: optText(200),
  previousChurch: yesNo,
  previousChurchName: optText(200),
  previousChurchLocation: optText(200),
  pcncTrainings: z.array(z.enum(PCNC_TRAININGS)).max(PCNC_TRAININGS.length).default([]),
  hasServed: yesNo,
  servedDepartment: optText(200),
  ministryService: optText(300),
  communityService: optText(300),
  otherRoles: optText(300),
  availableToServe: yesNo,
  interests: optText(500),
  observations: optText(2000),
  journeyDetails: optText(2000),
  spiritualGoals: optText(2000),
  specificDetails: optText(2000),
  consent: z.enum(["on", "true"], { error: "Ton accord est nécessaire pour envoyer la fiche" }),
  /** Champ piège anti-robot : rempli = robot. */
  website: z.string().optional(),
});

export type ApplicationFormInput = z.input<typeof applicationFormSchema>;
export type ApplicationForm = z.output<typeof applicationFormSchema>;

/** Données de la fiche enregistrées (sans consentement ni piège). */
export type ApplicationData = Omit<ApplicationForm, "consent" | "website">;

export const applicationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reject"), reason: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("link-member"), memberId: z.string().min(1).nullable() }),
]);

export const assignSchema = z.object({
  departmentIds: z.array(z.string().min(1)).min(1, "Choisis au moins un département").max(10),
});

export const assignmentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("confirm") }),
  z.object({
    action: z.literal("send-back"),
    reason: z.string().trim().min(3, "Le motif est obligatoire").max(2000),
  }),
]);

export const settingsSchema = z.object({
  churchId: z.string().min(1),
  observationMonths: z.number().int().min(1).max(12),
  retentionMonths: z.number().int().min(1).max(36),
  pvsEmails: z
    .array(
      z.object({
        departmentId: z.string().min(1),
        email: z.union([z.email("Adresse e-mail invalide").max(255), z.null()]),
      })
    )
    .max(20),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export const ASSIGNMENT_STATUS_LABEL = {
  PENDING: "En attente d'accueil",
  OBSERVATION: "En observation",
  CONFIRMED: "Confirmé",
  SENT_BACK: "Renvoyé au PVS",
} as const;

export const APPLICATION_STATUS_LABEL = {
  RECEIVED: "Reçue",
  VALIDATED: "Validée",
  REJECTED: "Non retenue",
} as const;
