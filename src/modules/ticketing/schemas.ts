import { z } from "zod";
import type {
  TicketingAgeGroup,
  TicketingChargeStatus,
  TicketingEventStatus,
  TicketingOptionScope,
  TicketingOptionType,
  TicketingPaymentMethod,
  TicketingRole,
} from "@/generated/prisma/enums";
import { ibanError, normalizeIban } from "@/lib/iban";

/**
 * Schémas purs de la billetterie (spec 074), partagés par les contrats d'API (ADR-0023), les
 * services et les écrans. Les montants se saisissent en euros.
 */

export const AGE_GROUPS = ["ADULT", "TEEN", "CHILD", "INFANT"] as const satisfies readonly TicketingAgeGroup[];
export const AGE_GROUP_LABEL: Record<TicketingAgeGroup, string> = {
  ADULT: "Adulte",
  TEEN: "12–17 ans",
  CHILD: "Enfant",
  INFANT: "Moins de 3 ans",
};
/** Mineurs : tout sauf adulte. */
export const isMinor = (g: TicketingAgeGroup) => g !== "ADULT";

export const EVENT_STATUSES = ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"] as const satisfies readonly TicketingEventStatus[];
export const EVENT_STATUS_LABEL: Record<TicketingEventStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "Inscriptions ouvertes",
  CLOSED: "Inscriptions closes",
  ARCHIVED: "Clôturé",
};

export const ROLES = ["ORGANIZER", "TREASURER", "RECEPTION", "CATERING", "OBSERVER"] as const satisfies readonly TicketingRole[];
export const ROLE_LABEL: Record<TicketingRole, string> = {
  ORGANIZER: "Organisateur",
  TREASURER: "Trésorier",
  RECEPTION: "Accueil / sécurité",
  CATERING: "Restauration",
  OBSERVER: "Observateur",
};

export const OPTION_TYPES = ["CHOICE", "QUANTITY", "CHECKBOX"] as const satisfies readonly TicketingOptionType[];
export const OPTION_TYPE_LABEL: Record<TicketingOptionType, string> = {
  CHOICE: "Choix unique (menu)",
  QUANTITY: "Quantité",
  CHECKBOX: "Case à cocher",
};
export const OPTION_SCOPES = ["PARTICIPANT", "BOOKING"] as const satisfies readonly TicketingOptionScope[];
export const OPTION_SCOPE_LABEL: Record<TicketingOptionScope, string> = {
  PARTICIPANT: "Par participant",
  BOOKING: "Par réservation",
};

export const PAYMENT_METHODS = ["WERO", "REVOLUT", "TRANSFER", "CASH", "CHEQUE"] as const satisfies readonly TicketingPaymentMethod[];
export const PAYMENT_METHOD_LABEL: Record<TicketingPaymentMethod, string> = {
  WERO: "Wero",
  REVOLUT: "Revolut",
  TRANSFER: "Virement",
  CASH: "Espèces",
  CHEQUE: "Chèque",
};
/** Moyens réglés à distance (déclarés par « J'ai payé »). */
export const REMOTE_METHODS = ["WERO", "REVOLUT", "TRANSFER"] as const;
/** Moyens encaissés en direct (accueil, restauration, trésorier). */
export const DIRECT_METHODS = ["CASH", "CHEQUE"] as const;

export const CHARGE_STATUS_LABEL: Record<TicketingChargeStatus, string> = {
  FREE: "Gratuit",
  DUE: "À régler",
  DECLARED: "Déclaré",
  PAID: "Payé",
  REFUND_DUE: "À rembourser",
  REFUNDED: "Remboursé",
  RELEASED: "Libéré",
  CANCELLED: "Annulé",
};

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const money = z.coerce.number().min(0).max(10_000).transform((v) => Math.round(v * 100) / 100);
const isoDate = z.coerce.date();
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((v) => v.startsWith("https://"), "Lien en https uniquement");

// ── Moyens de paiement ───────────────────────────────────────────────────────

export const paymentMethodsSchema = z
  .object({
    wero: z.object({ target: text(120) }).nullish(),
    revolut: z.object({ link: httpsUrl }).nullish(),
    transfer: z
      .object({
        iban: z
          .string()
          .trim()
          .max(42)
          .transform(normalizeIban)
          .superRefine((v, ctx) => {
            const message = ibanError(v);
            if (message) ctx.addIssue({ code: "custom", message });
          }),
        holder: text(120),
      })
      .nullish(),
    cash: z.boolean().default(false),
    cheque: z.boolean().default(false),
  })
  .strict();
export type PaymentMethodsConfig = z.infer<typeof paymentMethodsSchema>;

/** Lecture tolérante de la colonne JSON (jamais d'erreur à l'affichage). */
export function readPaymentMethods(value: unknown): PaymentMethodsConfig {
  const parsed = paymentMethodsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { cash: false, cheque: false };
}

/** Moyens réellement proposés au participant. */
export function enabledMethods(config: PaymentMethodsConfig): TicketingPaymentMethod[] {
  const out: TicketingPaymentMethod[] = [];
  if (config.wero) out.push("WERO");
  if (config.revolut) out.push("REVOLUT");
  if (config.transfer) out.push("TRANSFER");
  if (config.cash) out.push("CASH");
  if (config.cheque) out.push("CHEQUE");
  return out;
}

// ── Questions supplémentaires ────────────────────────────────────────────────

export const questionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: text(200),
  required: z.boolean().default(false),
});
export const questionsSchema = z.array(questionSchema).max(10);
export type TicketingQuestion = z.infer<typeof questionSchema>;

export function readQuestions(value: unknown): TicketingQuestion[] {
  const parsed = questionsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

// ── Événement ────────────────────────────────────────────────────────────────

export const eventCreateSchema = z
  .object({
    title: text(150),
    startsAt: isoDate,
    endsAt: isoDate,
    capacity: z.coerce.number().int().min(1).max(100_000),
  })
  .refine((d) => d.endsAt > d.startsAt, { message: "La fin doit suivre le début", path: ["endsAt"] });

export const tariffSchema = z.object({ ageGroup: z.enum(AGE_GROUPS), price: money });

export const eventUpdateSchema = z
  .object({
    title: text(150),
    description: optionalText(5000),
    location: optionalText(200),
    startsAt: isoDate,
    endsAt: isoDate,
    registrationDeadline: isoDate.nullable(),
    capacity: z.coerce.number().int().min(1).max(100_000),
    seatsOpen: z.coerce.number().int().min(0).max(100_000),
    status: z.enum(EVENT_STATUSES),
    tariffs: z.array(tariffSchema).max(4),
    paymentMethods: paymentMethodsSchema,
    optionPaymentDeadline: isoDate.nullable(),
    reminderDaysBefore: z.coerce.number().int().min(0).max(30),
    allowOnsitePayment: z.boolean(),
    allowUnaccompaniedMinors: z.boolean(),
    allowWalkIns: z.boolean(),
    entryRefundable: z.boolean(),
    entryRefundDeadline: isoDate.nullable(),
    questions: questionsSchema,
    referencePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,8}$/, "2 à 8 lettres ou chiffres"),
    retentionDays: z.coerce.number().int().min(7).max(730),
  })
  .partial()
  .strict()
  .superRefine((d, ctx) => {
    if (d.startsAt && d.endsAt && d.endsAt <= d.startsAt) {
      ctx.addIssue({ code: "custom", message: "La fin doit suivre le début", path: ["endsAt"] });
    }
    if (d.capacity !== undefined && d.seatsOpen !== undefined && d.seatsOpen > d.capacity) {
      ctx.addIssue({ code: "custom", message: "Les places ouvertes ne dépassent pas la jauge", path: ["seatsOpen"] });
    }
    if (d.tariffs && new Set(d.tariffs.map((t) => t.ageGroup)).size !== d.tariffs.length) {
      ctx.addIssue({ code: "custom", message: "Un tarif par tranche d'âge", path: ["tariffs"] });
    }
  });
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

// ── Options et variantes ─────────────────────────────────────────────────────

/** Champs d'une variante que la restauration compose (lot 3) — l'organisateur aussi. */
export const variantSchema = z
  .object({
    label: text(120),
    description: optionalText(300),
    allergens: optionalText(200),
    stock: z.coerce.number().int().min(0).max(100_000).nullable(),
    prepared: z.coerce.number().int().min(0).max(100_000).nullable(),
    closed: z.boolean(),
    position: z.coerce.number().int().min(0).max(1000),
  })
  .partial()
  .strict();
export const variantCreateSchema = z
  .object({
    label: text(120),
    description: optionalText(300),
    allergens: optionalText(200),
    stock: z.coerce.number().int().min(0).max(100_000).nullish(),
  })
  .strict();

/** Champs d'une option réservés à l'organisateur (ce qui engage les inscrits). */
export const optionSchema = z
  .object({
    label: text(120),
    description: optionalText(500),
    type: z.enum(OPTION_TYPES),
    scope: z.enum(OPTION_SCOPES),
    price: money,
    stock: z.coerce.number().int().min(0).max(100_000).nullable(),
    pickup: z.boolean(),
    namedPrep: z.boolean(),
    refundable: z.boolean(),
    refundDeadline: isoDate.nullable(),
    active: z.boolean(),
    position: z.coerce.number().int().min(0).max(1000),
  })
  .strict();
export const optionCreateSchema = optionSchema
  .partial({ description: true, stock: true, pickup: true, namedPrep: true, refundable: true, refundDeadline: true, active: true, position: true })
  .extend({ variants: z.array(z.object({ label: text(120) })).max(20).optional() });
export const optionUpdateSchema = optionSchema.partial();

// ── Rôles ────────────────────────────────────────────────────────────────────

export const rolesSchema = z
  .object({
    roles: z.array(z.object({ userId: z.string().min(1).max(40), role: z.enum(ROLES) })).max(200),
  })
  .strict();

// ── Inscription (public) ─────────────────────────────────────────────────────

export const selectionSchema = z
  .object({
    optionId: z.string().min(1).max(40),
    variantId: z.string().min(1).max(40).nullish(),
    quantity: z.coerce.number().int().min(1).max(20).default(1),
  })
  .strict();
export type OptionSelection = z.infer<typeof selectionSchema>;

export const participantInputSchema = z
  .object({
    firstName: text(80),
    lastName: text(80),
    ageGroup: z.enum(AGE_GROUPS),
    options: z.array(selectionSchema).max(20).default([]),
  })
  .strict();
export type ParticipantInput = z.infer<typeof participantInputSchema>;

export const contactSchema = z
  .object({
    name: text(150),
    email: z.string().trim().toLowerCase().email().max(191),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+\d\s().-]*$/, "Numéro invalide")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .strict();

export const guardianSchema = z
  .object({
    name: text(150),
    phone: z.string().trim().min(6).max(40).regex(/^[+\d\s().-]+$/, "Numéro invalide"),
    consent: z.literal(true),
  })
  .strict();

export const bookingCreateSchema = z
  .object({
    participants: z.array(participantInputSchema).min(1).max(20),
    bookingOptions: z.array(selectionSchema).max(20).default([]),
    answers: z.record(z.string().max(40), z.string().trim().max(500)).default({}),
    contact: contactSchema,
    guardian: guardianSchema.nullish(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const recoverSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(191),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

/** Modifications par le titulaire (lien « Ma réservation »). */
export const bookingPatchSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("updateOptions"),
      participants: z
        .array(z.object({ participantId: z.string().min(1).max(40), options: z.array(selectionSchema).max(20) }).strict())
        .max(20),
      bookingOptions: z.array(selectionSchema).max(20),
    })
    .strict(),
  z.object({ action: z.literal("addParticipant"), participant: participantInputSchema }).strict(),
  z
    .object({
      action: z.literal("renameParticipant"),
      participantId: z.string().min(1).max(40),
      firstName: text(80),
      lastName: text(80),
    })
    .strict(),
  z.object({ action: z.literal("updatePhone"), phone: contactSchema.shape.phone }).strict(),
  z.object({ action: z.literal("cancelParticipant"), participantId: z.string().min(1).max(40) }).strict(),
  z.object({ action: z.literal("cancelBooking") }).strict(),
]);
export type BookingPatchInput = z.infer<typeof bookingPatchSchema>;

export const declarePaymentSchema = z.object({ method: z.enum(REMOTE_METHODS) }).strict();

// ── Règlements (équipe) ──────────────────────────────────────────────────────

export const chargeRefSchema = z
  .object({ type: z.enum(["entry", "item"]), id: z.string().min(1).max(40) })
  .strict();
export type ChargeRef = z.infer<typeof chargeRefSchema>;

export const receiptSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    charges: z.array(chargeRefSchema).min(1).max(100),
    opId: z.string().min(8).max(64).optional(),
  })
  .strict();

export const paymentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }).strict(),
  z.object({ action: z.literal("reject"), reason: text(300) }).strict(),
]);

export const refundSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    charges: z.array(chargeRefSchema).min(1).max(100),
  })
  .strict();

export const organizerBookingPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancelParticipant"), participantId: z.string().min(1).max(40) }).strict(),
  z.object({ action: z.literal("cancelBooking") }).strict(),
  z.object({ action: z.literal("remind") }).strict(),
]);

export const EXPORT_TYPES = ["participants", "payments", "refunds", "options", "passages"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

// ── Formes renvoyées au public ───────────────────────────────────────────────

export interface PublicVariant {
  id: string;
  label: string;
  description: string | null;
  allergens: string | null;
  remaining: number | null;
}
export interface PublicOption {
  id: string;
  label: string;
  description: string | null;
  type: TicketingOptionType;
  scope: TicketingOptionScope;
  price: number;
  remaining: number | null;
  refundable: boolean;
  refundDeadline: string | null;
  variants: PublicVariant[];
}
export interface PublicEvent {
  id: string;
  churchSlug: string;
  churchName: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  hasPoster: boolean;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string | null;
  status: TicketingEventStatus;
  /** Inscription possible maintenant ; sinon `closedReason`. */
  open: boolean;
  closedReason: string | null;
  seatsRemaining: number;
  tariffs: { ageGroup: TicketingAgeGroup; price: number }[];
  options: PublicOption[];
  questions: TicketingQuestion[];
  methods: TicketingPaymentMethod[];
  allowUnaccompaniedMinors: boolean;
  optionPaymentDeadline: string | null;
}

/** Instructions de paiement montrées au participant (jamais les coordonnées de l'église). */
export interface PaymentInstructions {
  reference: string;
  wero: string | null;
  revolut: string | null;
  transfer: { iban: string; holder: string } | null;
  cash: boolean;
  cheque: boolean;
}

export function paymentInstructions(reference: string, config: PaymentMethodsConfig): PaymentInstructions {
  return {
    reference,
    wero: config.wero?.target ?? null,
    revolut: config.revolut?.link ?? null,
    transfer: config.transfer ? { iban: config.transfer.iban, holder: config.transfer.holder } : null,
    cash: config.cash,
    cheque: config.cheque,
  };
}

export function formatEuros(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

// ── Codes scannés (client et serveur) ────────────────────────────────────────

/** Préfixes des QR non-URL : ils disent au scanner ce qu'il lit. */
export const QR_PREFIX = {
  scan: "KOINONIA-RESA:",
  badge: "KOINONIA-BADGE:",
  label: "KOINONIA-REPAS:",
} as const;

export type ScannedScope = "ticket" | keyof typeof QR_PREFIX;

const TOKEN_RE = /^[0-9a-f]{64}$/;

/**
 * Lit un code scanné : URL de billet (`…/billet/<jeton>`), code de réservation, badge ou
 * étiquette. Renvoie la portée et le jeton, ou `null` si le code n'est pas de Koinonia.
 */
export function parseScannedCode(raw: string): { scope: ScannedScope; token: string } | null {
  const value = raw.trim();
  const ticket = /\/billet\/([0-9a-f]{64})(?:[/?#]|$)/.exec(value);
  if (ticket) return { scope: "ticket", token: ticket[1] };
  for (const [scope, prefix] of Object.entries(QR_PREFIX) as [keyof typeof QR_PREFIX, string][]) {
    if (value.startsWith(prefix)) {
      const token = value.slice(prefix.length);
      return TOKEN_RE.test(token) ? { scope, token } : null;
    }
  }
  return null;
}

// ── Équipe et contrôle (lot 2) ───────────────────────────────────────────────

export const postSchema = z.object({ name: text(120) }).strict();

export const assignmentSchema = z
  .object({
    postId: z.string().min(1).max(40).nullish(),
    userId: z.string().min(1).max(40).nullish(),
    guestName: optionalText(150),
    startsAt: isoDate.nullish(),
    endsAt: isoDate.nullish(),
  })
  .strict()
  .refine((d) => !!d.userId !== !!d.guestName, { message: "Un compte ou le nom d'un intervenant", path: ["userId"] });

const opId = z.string().min(8).max(64).regex(/^[\w-]+$/);
const scannedAt = z.coerce.date();

export const syncOpSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("passage"),
      id: opId,
      subject: z.enum(["PARTICIPANT", "STAFF"]),
      participantId: z.string().min(1).max(64).optional(),
      assignmentId: z.string().min(1).max(64).optional(),
      direction: z.enum(["IN", "OUT"]),
      scannedAt,
      gate: z.string().trim().max(60).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("manual"),
      id: opId,
      direction: z.enum(["IN", "OUT"]),
      reason: text(200),
      scannedAt,
      gate: z.string().trim().max(60).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("walkin"),
      id: opId,
      participants: z
        .array(z.object({ firstName: text(80), lastName: text(80), ageGroup: z.enum(AGE_GROUPS) }).strict())
        .min(1)
        .max(10),
      phone: z.string().trim().max(40).nullish(),
      method: z.enum(DIRECT_METHODS).nullish(),
      enter: z.boolean().default(true),
      scannedAt,
      gate: z.string().trim().max(60).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("receipt"),
      id: opId,
      bookingId: z.string().min(1).max(64),
      participantIds: z.array(z.string().min(1).max(64)).min(1).max(20),
      method: z.enum(DIRECT_METHODS),
    })
    .strict(),
  z
    .object({
      type: z.literal("delivery"),
      id: opId,
      itemId: z.string().min(1).max(64),
      /** Quantité **totale** remise après ce geste : rejouer l'opération ne compte rien de plus. */
      delivered: z.coerce.number().int().min(1).max(20),
      method: z.enum(DIRECT_METHODS).nullish(),
      scannedAt,
    })
    .strict(),
  z
    .object({
      type: z.literal("onsiteSale"),
      id: opId,
      optionId: z.string().min(1).max(64),
      variantId: z.string().min(1).max(64).nullish(),
      quantity: z.coerce.number().int().min(1).max(50),
      method: z.enum(DIRECT_METHODS),
      scannedAt,
    })
    .strict(),
]);
export type SyncOp = z.infer<typeof syncOpSchema>;

export const syncSchema = z
  .object({
    deviceId: z.string().min(8).max(64).regex(/^[\w-]+$/),
    clientTime: z.coerce.date(),
    ops: z.array(syncOpSchema).max(500),
  })
  .strict();

export const snapshotQuerySchema = z.object({ for: z.enum(["reception", "catering"]) });

