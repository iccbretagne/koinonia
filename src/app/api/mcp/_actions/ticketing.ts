import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { logAudit, withAuditContext } from "@/lib/audit";
import { maskIban } from "@/lib/iban";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import type { BookingView, EventAccess, EventAction } from "@/modules/ticketing";
import {
  AGE_GROUPS,
  AGE_GROUP_LABEL,
  OPTION_SCOPES,
  OPTION_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  ROLES,
  ROLE_LABEL,
  assignmentSchema,
  assignmentUpdateSchema,
  blockingChecks,
  eventCreateSchema,
  eventUpdateSchema,
  optionCreateSchema,
  optionUpdateSchema,
  paymentActionSchema,
  paymentMethodsSchema,
  postSchema,
  receiptSchema,
  refundSchema,
  rolesSchema,
  syncSchema,
  variantCreateSchema,
  variantSchema,
} from "@/modules/ticketing/schemas";
import { formatDay, formatTime } from "../../assistant/_data/common";
import { CHANGED, EXPIRED, byText, confirmInput, fingerprint, parisDateTime, previewText, refusal, type ActionContext, type ActionResult, type McpActionDef } from "./common";

/**
 * Billetterie (spec 083) : conduire un événement de billetterie de sa création à sa clôture.
 * Chaque action appelle le service de l'écran avec ses règles ; le droit est celui du rôle
 * d'événement (`EVENT_ACTIONS`), vérifié à l'aperçu et à la confirmation, dans l'église de
 * l'événement. Jamais d'email ni de téléphone d'un participant, jamais d'IBAN en clair.
 * Le module est chargé à la demande : il peut être désactivé (`ENABLED_MODULES`).
 */

const ticketing = () => import("@/modules/ticketing");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
/** Un nom de compte peut être vide : jamais d'email à la place. */
export const safeName = (name: string | null | undefined) => (name && !name.includes("@") ? name : "Compte sans nom");

export const NOT_ROLE = "Vous n'avez pas ce rôle sur cet événement dans Koinonia.";
const NOT_FOUND = "Événement de billetterie introuvable dans cette église.";
const NOT_MANAGER = "Créer un événement de billetterie est réservé à l'Admin, à la Secrétaire et au Super Admin.";

export const eventRef = z.string().trim().min(1).max(200).describe("Identifiant de l'événement de billetterie, ou son titre exact");

const link = (eventId: string, vue?: string) => `${publicOrigin()}/billetterie/${eventId}${vue ? `?vue=${vue}` : ""}`;

/** Événement désigné par identifiant ou titre, parmi ceux que le compte voit (comme la liste de l'écran). */
export async function resolveEvent(ctx: ActionContext, ref: string): Promise<{ id: string; title: string } | string> {
  const m = await ticketing();
  const manager = await m.isTicketingManager(ctx.session, ctx.churchId);
  const events = await m.listEvents(ctx.churchId, ctx.viewer.userId, manager);
  const byId = events.find((e) => e.id === ref);
  if (byId) return byId;
  const matches = events.filter((e) => norm(e.title) === norm(ref));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return `Plusieurs événements s'appellent « ${ref} » : ${matches.map((e) => `${formatDay(e.startsAt)} (${e.id})`).join(", ")}. Précisez l'identifiant.`;
  }
  return NOT_FOUND;
}

/** Droits du compte sur l'événement, dans l'église de la connexion ; `null` si introuvable. */
async function accessTo(ctx: ActionContext, eventId: string): Promise<EventAccess | null> {
  const m = await ticketing();
  const access = await m.getEventAccess(ctx.session, eventId).catch(() => null);
  return access && access.churchId === ctx.churchId ? access : null;
}

/** Événement résolu et rôle vérifié, ou le texte du refus. */
export async function eventFor(ctx: ActionContext, ref: string, role: EventAction): Promise<{ id: string; title: string; access: EventAccess } | string> {
  const event = await resolveEvent(ctx, ref);
  if (typeof event === "string") return event;
  const access = await accessTo(ctx, event.id);
  if (!access) return NOT_FOUND;
  if (!(await ticketing()).canDo(access, role)) return NOT_ROLE;
  return { id: event.id, title: event.title, access };
}

/** Paramètres de paiement montrés à l'assistant : l'IBAN reste masqué. */
export function safePaymentMethods(pm: { transfer?: { iban: string; holder: string } | null } & Record<string, unknown>) {
  return { ...pm, transfer: pm.transfer ? { iban: maskIban(pm.transfer.iban), holder: pm.transfer.holder } : null };
}

// ─── Constructeur des actions ────────────────────────────────────────────────

export interface Prepared<P> {
  /** Lignes de l'aperçu. */
  lines: string[];
  payload: P;
}

interface EventActionSpec<I extends z.ZodObject<z.ZodRawShape>, P extends { eventId?: string }> {
  /** Base des outils : `<action>_preview` / `<action>_confirm`. */
  action: string;
  /** Rôle d'événement requis, ou `manager` (`ticketing:manage` dans l'église, sans événement). */
  role: EventAction | "manager";
  description: string;
  confirmDescription: string;
  input: I;
  /** Vérifie et résume ; reçoit l'événement résolu (absent pour `manager`). */
  prepare: (input: z.infer<I>, ctx: ActionContext, event: { id: string; title: string; access: EventAccess } | null) => Promise<Prepared<P> | string>;
  /** État relu à l'aperçu et à la confirmation : différent ⇒ rien n'est fait. */
  state: (payload: P, ctx: ActionContext) => Promise<unknown>;
  /** Exécute par le service de l'écran ; renvoie le texte du résultat. */
  execute: (payload: P, ctx: ActionContext) => Promise<Executed>;
  /** Entrées d'audit pour les services qui ne journalisent pas eux-mêmes (`data` : ce que `execute` a renvoyé). */
  audit?: (payload: P, ctx: ActionContext, data: unknown) => AuditEntry | AuditEntry[];
}

interface Executed {
  text: string;
  eventId?: string;
  vue?: string;
  data?: unknown;
}
interface AuditEntry {
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

/** Refus lisible d'une saisie que le schéma de l'écran rejette. */
const zodRefusal = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "saisie"} : ${i.message}`).join(" ; ");

type Stored<P> = { payload: P; fp: string };

async function allowed(ctx: ActionContext, role: EventAction | "manager", eventId?: string): Promise<string | null> {
  const m = await ticketing();
  if (role === "manager") return (await m.isTicketingManager(ctx.session, ctx.churchId)) ? null : NOT_MANAGER;
  const access = eventId ? await accessTo(ctx, eventId) : null;
  if (!access) return NOT_FOUND;
  return m.canDo(access, role) ? null : NOT_ROLE;
}

/** Une paire `…_preview` / `…_confirm` (spec 081 : aperçu, jeton, confirmation revérifiée). */
export function eventAction<I extends z.ZodObject<z.ZodRawShape>, P extends { eventId?: string }>(spec: EventActionSpec<I, P>): McpActionDef[] {
  async function preview(input: z.infer<I>, ctx: ActionContext): Promise<ActionResult> {
    let event: { id: string; title: string; access: EventAccess } | null = null;
    if (spec.role === "manager") {
      const denied = await allowed(ctx, "manager");
      if (denied) return refusal(denied);
    } else {
      const found = await eventFor(ctx, String((input as { event?: string }).event ?? ""), spec.role);
      if (typeof found === "string") return refusal(found);
      event = found;
    }
    let prepared: Prepared<P> | string;
    try {
      prepared = await spec.prepare(input, ctx, event);
    } catch (error) {
      if (error instanceof ApiError) return refusal(error.message);
      if (error instanceof z.ZodError) return refusal(zodRefusal(error));
      throw error;
    }
    if (typeof prepared === "string") return refusal(prepared);
    const fp = fingerprint(await spec.state(prepared.payload, ctx));
    const stored: Stored<P> = { payload: prepared.payload, fp };
    const { token, expiresAt } = await createConfirmation(ctx.grantId, spec.action, stored as unknown as Prisma.InputJsonValue);
    return {
      text: previewText(prepared.lines, token),
      structured: { done: false, action: spec.action, confirmation: token, expiresAt: expiresAt.toISOString() },
    };
  }

  async function confirm(input: z.infer<typeof confirmInput>, ctx: ActionContext): Promise<ActionResult> {
    // Payload effacé dès sa lecture : il peut contenir un IBAN dicté.
    const stored = (await consumeConfirmation(ctx.grantId, spec.action, input.confirmation, new Date(), { erase: true })) as Stored<P> | null;
    if (!stored) return refusal(EXPIRED);
    const denied = await allowed(ctx, spec.role, stored.payload.eventId);
    if (denied) return refusal(denied);
    if (fingerprint(await spec.state(stored.payload, ctx)) !== stored.fp) return refusal(CHANGED);
    let result: Executed;
    try {
      result = await withAuditContext({ via: "mcp" }, async () => {
        const done = await spec.execute(stored.payload, ctx);
        const entries = spec.audit?.(stored.payload, ctx, done.data) ?? [];
        for (const entry of [entries].flat()) await logAudit({ userId: ctx.viewer.userId, churchId: ctx.churchId, ...entry });
        return done;
      });
    } catch (error) {
      if (error instanceof ApiError) return refusal(`${error.message} Rien n'est fait : refaites l'aperçu.`);
      if (error instanceof z.ZodError) return refusal(`${zodRefusal(error)} Rien n'est fait : refaites l'aperçu.`);
      throw error;
    }
    const eventId = result.eventId ?? stored.payload.eventId;
    const url = eventId ? link(eventId, result.vue) : `${publicOrigin()}/billetterie`;
    return { text: `${result.text}\nVoir dans Koinonia : ${url}`, structured: { done: true, action: spec.action, link: url } };
  }

  const available = (viewer: ActionContext["viewer"]) =>
    viewer.modules.includes("ticketing") &&
    (spec.role === "manager" ? viewer.isSuperAdmin || viewer.permissions.includes("ticketing:manage") : viewer.predicates.includes("ticketing"));

  return [
    { name: `${spec.action}_preview`, action: spec.action, kind: "preview", description: spec.description, input: spec.input, available, run: preview as McpActionDef["run"] },
    { name: `${spec.action}_confirm`, action: spec.action, kind: "confirm", description: spec.confirmDescription, input: confirmInput, available, run: confirm as McpActionDef["run"] },
  ];
}

// ─── Lectures liées aux actions ──────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { DRAFT: "Brouillon", OPEN: "Inscriptions ouvertes", CLOSED: "Inscriptions closes", ARCHIVED: "Clôturé" };
const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const when = (d: Date | string) => `${formatDay(new Date(d))} ${formatTime(new Date(d))}`;

const eventInput = z.object({ event: eventRef });

async function readEvent(input: z.infer<typeof eventInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "read");
  if (typeof found === "string") return refusal(found);
  const m = await ticketing();
  const { readinessChecks, PAYMENT_METHOD_LABEL, AGE_GROUP_LABEL, enabledMethods } = await import("@/modules/ticketing/schemas");
  const [e, team] = await Promise.all([m.getEventDetail(found.id), m.listTeam(found.id)]);
  const checks = readinessChecks(e);
  const blocking = checks.filter((c) => c.required && !c.done);
  const lines = [
    `${e.title} — ${STATUS_LABEL[e.status]} (identifiant ${e.id})`,
    `Du ${when(e.startsAt)} au ${when(e.endsAt)}${e.location ? `, ${e.location}` : ""}`,
    `Places : ${e.seatsTaken} inscrits / ${e.seatsOpen} ouvertes / jauge ${e.capacity}`,
    `Tarifs : ${e.tariffs.map((t) => `${AGE_GROUP_LABEL[t.ageGroup]} ${euros(t.price)}`).join(", ") || "aucun"}`,
    `Paiement : ${enabledMethods(e.paymentMethods).map((x) => PAYMENT_METHOD_LABEL[x]).join(", ") || "aucun"}${e.paymentMethods.transfer ? ` (IBAN ${maskIban(e.paymentMethods.transfer.iban)})` : ""}`,
    `Options : ${e.options.map((o) => `${o.label} [${o.id}] ${euros(o.price)}${o.active ? "" : " (fermée)"}${o.variants.length ? ` — plats : ${o.variants.map((v) => `${v.label} [${v.id}]${v.closed ? " fermé" : ""}`).join(", ")}` : ""}`).join(" ; ") || "aucune"}`,
    `Rôles : ${e.roles.map((r) => `${safeName(r.name)} (${r.role}) [${r.userId}]`).join(", ") || "aucun"}`,
    `Postes : ${team.posts.map((p) => `${p.name} [${p.id}]`).join(", ") || "aucun"} ; ${team.assignments.length} affectation(s)`,
    blocking.length ? `Avant d'ouvrir : ${blocking.map((c) => c.label).join(", ")}` : "Prêt à ouvrir : rien de bloquant.",
    `Mes rôles : ${[...found.access.roles].join(", ")}`,
  ];
  return {
    text: lines.join("\n"),
    structured: {
      id: e.id,
      title: e.title,
      status: e.status,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      description: e.description,
      capacity: e.capacity,
      seatsOpen: e.seatsOpen,
      seatsTaken: e.seatsTaken,
      registrationDeadline: e.registrationDeadline,
      optionPaymentDeadline: e.optionPaymentDeadline,
      tariffs: e.tariffs,
      paymentMethods: safePaymentMethods(e.paymentMethods),
      rules: {
        allowOnsitePayment: e.allowOnsitePayment,
        allowUnaccompaniedMinors: e.allowUnaccompaniedMinors,
        allowWalkIns: e.allowWalkIns,
        entryRefundable: e.entryRefundable,
        entryRefundDeadline: e.entryRefundDeadline,
        reminderDaysBefore: e.reminderDaysBefore,
        retentionDays: e.retentionDays,
      },
      options: e.options.map((o) => ({
        id: o.id,
        label: o.label,
        type: o.type,
        scope: o.scope,
        price: o.price,
        active: o.active,
        choiceGroup: o.choiceGroup,
        used: o.used,
        variants: o.variants.map((v) => ({ id: v.id, label: v.label, closed: v.closed, stock: v.stock, used: v.used })),
      })),
      roles: e.roles.map((r) => ({ userId: r.userId, role: r.role, name: safeName(r.name) })),
      posts: team.posts,
      assignments: team.assignments.map((a) => ({ id: a.id, name: safeName(a.name), postId: a.postId, startsAt: a.startsAt, endsAt: a.endsAt })),
      blocking: blocking.map((c) => c.key),
      myRoles: [...found.access.roles],
      link: link(e.id),
    },
  };
}

const bookingsInput = z.object({
  event: eventRef,
  search: z.string().trim().max(100).optional().describe("Nom du contact ou d'un participant, ou référence"),
  limit: z.number().int().min(1).max(100).optional().describe("50 par défaut"),
  offset: z.number().int().min(0).optional(),
});

async function readBookings(input: z.infer<typeof bookingsInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "read");
  if (typeof found === "string") return refusal(found);
  // Jamais de coordonnées : `withContact` faux, quel que soit le rôle.
  const rows = await (await ticketing()).listBookings(found.id, false);
  const q = input.search ? norm(input.search) : null;
  const filtered = q
    ? rows.filter((b) => norm(b.reference).includes(q) || norm(b.contact.name ?? "").includes(q) || b.participants.some((p) => norm(`${p.firstName} ${p.lastName}`).includes(q)))
    : rows;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const page = filtered.slice(offset, offset + limit).map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    contactName: b.contact.name,
    participants: b.participants.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, ageGroup: p.ageGroup, status: p.status })),
    balances: b.balances,
  }));
  const next = offset + limit < filtered.length ? offset + limit : null;
  return {
    text:
      page.length === 0
        ? "Aucune réservation ne correspond."
        : page.map((b) => `${b.reference} · ${b.contactName} · ${b.participants.length} participant(s) · ${b.status} [${b.id}]`).join("\n"),
    structured: { total: filtered.length, nextOffset: next, bookings: page },
  };
}

async function readPresence(input: z.infer<typeof eventInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "read");
  if (typeof found === "string") return refusal(found);
  const p = await (await ticketing()).getPresence(found.id);
  // Ni noms ni téléphones des mineurs non accompagnés : seulement leur nombre.
  const structured = { capacity: p.capacity, counts: p.counts, level: p.level, anomalies: p.anomalies, unaccompanied: p.unaccompanied.length };
  return { text: `Présents : ${p.counts.total} / jauge ${p.capacity} (${p.level}). Anomalies : ${p.anomalies}.`, structured };
}

async function readCatering(input: z.infer<typeof eventInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "read");
  if (typeof found === "string") return refusal(found);
  const m = await ticketing();
  const [board, snap] = await Promise.all([m.cateringBoard(found.id), m.cateringSnapshot(found.id)]);
  // Identifiants utiles à `ticketing_catering_sale` : éléments restant à remettre, articles vendables.
  const toDeliver = snap.items
    .filter((i) => i.deliveredQty < i.quantity)
    .slice(0, 50)
    .map((i) => ({ id: i.id, holder: i.holder, label: i.label, quantity: i.quantity, deliveredQty: i.deliveredQty, amountDue: i.amountDue }));
  return {
    text:
      board.toPrepare.map((s) => `${s.label} : ${s.available ?? "∞"} disponible(s), ${s.delivered} remis, ${s.reserved} réservé(s), ${s.sold} vendu(s)`).join("\n") ||
      "Aucun plat.",
    structured: { toPrepare: board.toPrepare, notCollected: board.notCollected.length, sales: board.sales, toDeliver, saleOptions: snap.sale },
  };
}

const accountsInput = z.object({ event: eventRef, search: z.string().trim().min(2).max(100).describe("Nom (ou partie du nom) du compte cherché") });

async function readAccounts(input: z.infer<typeof accountsInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "configure");
  if (typeof found === "string") return refusal(found);
  const q = norm(input.search);
  const accounts = (await (await ticketing()).listChurchAccounts(ctx.churchId)).filter((a) => a.name && norm(a.name).includes(q)).slice(0, 20);
  return {
    text: accounts.length ? accounts.map((a) => `${a.name} [${a.id}]`).join("\n") : `Aucun compte de l'église ne correspond à « ${input.search} ».`,
    structured: { accounts: accounts.map((a) => ({ id: a.id, name: a.name })) },
  };
}

const readAvailable = (viewer: ActionContext["viewer"]) => viewer.modules.includes("ticketing") && viewer.predicates.includes("ticketing");

// ─── Réservation et paiements (identifiants des actions de règlement) ───────

type ChargeRow = { type: "entry" | "item"; id: string; label: string; amount: number; status: string; pickup: boolean };
type ChargeScope = "all" | "entry" | "pickup";

/** Périmètre d'encaissement, comme la route `receipts` : trésorerie tout, accueil les entrées, restauration les retraits. */
function scopeOf(access: EventAccess): ChargeScope | null {
  if (access.roles.has("ORGANIZER") || access.roles.has("TREASURER")) return "all";
  if (access.roles.has("RECEPTION")) return "entry";
  if (access.roles.has("CATERING")) return "pickup";
  return null;
}

/** Éléments payants d'une réservation (comme `chargesOf` de l'écran), restreints au périmètre. */
function chargesIn(view: BookingView, pickupOptions: Set<string>, scope: ChargeScope | null): ChargeRow[] {
  const entries: ChargeRow[] = view.participants
    .filter((p) => p.entryPrice > 0)
    .map((p) => ({ type: "entry", id: p.id, label: `Entrée ${p.firstName} ${p.lastName}`, amount: p.entryPrice, status: p.entryStatus, pickup: false }));
  const items: ChargeRow[] = view.items
    .filter((i) => i.amount > 0)
    .map((i) => ({ type: "item", id: i.id, label: i.label, amount: i.amount, status: i.status, pickup: pickupOptions.has(i.optionId) }));
  const all = [...entries, ...items];
  if (scope === "all") return all;
  if (scope === "entry") return all.filter((c) => c.type === "entry");
  if (scope === "pickup") return all.filter((c) => c.type === "item" && c.pickup);
  return [];
}

/** Réservation de l'événement (jamais celle d'un autre) avec ses éléments payants visibles de l'appelant. */
async function loadBookingFor(eventId: string, bookingId: string, access: EventAccess) {
  const m = await ticketing();
  const [view, detail] = await Promise.all([m.getBookingView(bookingId), m.getEventDetail(eventId)]);
  if (view.event.id !== eventId) throw new ApiError(404, "Réservation introuvable");
  const pickup = new Set(detail.options.filter((o) => o.pickup).map((o) => o.id));
  return { view, detail, charges: chargesIn(view, pickup, scopeOf(access)) };
}

const bookingInput = z.object({ event: eventRef, bookingId: z.string().trim().min(1).max(64).describe("Identifiant de la réservation (voir ticketing_bookings)") });

async function readBooking(input: z.infer<typeof bookingInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "read");
  if (typeof found === "string") return refusal(found);
  let loaded: Awaited<ReturnType<typeof loadBookingFor>>;
  try {
    loaded = await loadBookingFor(found.id, input.bookingId, found.access);
  } catch (error) {
    if (error instanceof ApiError) return refusal(error.message);
    throw error;
  }
  const { view, charges } = loaded;
  // Jamais de coordonnées : le nom du contact, les participants et les éléments payants seulement.
  const participants = view.participants.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, ageGroup: p.ageGroup, status: p.status }));
  const lines = [
    `${view.reference} · ${view.contact.name} · ${view.status} [${view.id}]`,
    ...participants.map((p) => `${p.name} (${AGE_GROUP_LABEL[p.ageGroup]}) ${p.status} [${p.id}]`),
    ...charges.map((c) => `${c.label} : ${euros(c.amount)} ${c.status} [${c.type}:${c.id}]`),
  ];
  return { text: lines.join("\n"), structured: { id: view.id, reference: view.reference, status: view.status, contactName: view.contact.name, participants, charges, balances: view.balances } };
}

const paymentsInput = z.object({ event: eventRef, all: z.boolean().optional().describe("Vrai : tous les paiements (100 derniers) ; sinon seulement les déclarations « J'ai payé » à traiter") });

async function readPayments(input: z.infer<typeof paymentsInput>, ctx: ActionContext): Promise<ActionResult> {
  const found = await eventFor(ctx, input.event, "payments");
  if (typeof found === "string") return refusal(found);
  const rows = await (await ticketing()).listPayments(found.id);
  const picked = (input.all ? rows : rows.filter((p) => p.kind === "DECLARATION" && p.status === "PENDING")).slice(0, 100);
  const payments = picked.map((p) => ({ id: p.id, reference: p.reference, contactName: p.contactName, kind: p.kind, status: p.status, method: p.method, amount: p.amount, reason: p.reason }));
  return {
    text: payments.length
      ? payments.map((p) => `${p.reference} · ${p.contactName} · ${PAYMENT_METHOD_LABEL[p.method]} · ${euros(p.amount)} · ${p.kind} ${p.status} [${p.id}]`).join("\n")
      : "Aucun paiement à traiter.",
    structured: { payments },
  };
}

export const TICKETING_READS: McpActionDef[] = [
  {
    name: "ticketing_event",
    action: "ticketing_event",
    kind: "read",
    description:
      "Détail d'un événement de billetterie : état, dates, places, tarifs, moyens de paiement (IBAN masqué), règles, options et plats, rôles, postes et affectations, avec leurs identifiants, et ce qu'il reste à régler avant d'ouvrir.",
    input: eventInput,
    available: readAvailable,
    run: readEvent as McpActionDef["run"],
  },
  {
    name: "ticketing_bookings",
    action: "ticketing_bookings",
    kind: "read",
    description: "Réservations d'un événement de billetterie (référence, nom du contact, participants, soldes), sans coordonnées. Filtre par nom ou référence.",
    input: bookingsInput,
    available: readAvailable,
    run: readBookings as McpActionDef["run"],
  },
  {
    name: "ticketing_presence",
    action: "ticketing_presence",
    kind: "read",
    description: "Compteur de présence d'un événement de billetterie : présents, jauge, niveau, anomalies.",
    input: eventInput,
    available: readAvailable,
    run: readPresence as McpActionDef["run"],
  },
  {
    name: "ticketing_catering",
    action: "ticketing_catering",
    kind: "read",
    description: "Restauration d'un événement de billetterie : plats, stock disponible, remis, réservés, vendus sur place.",
    input: eventInput,
    available: readAvailable,
    run: readCatering as McpActionDef["run"],
  },
  {
    name: "ticketing_booking",
    action: "ticketing_booking",
    kind: "read",
    description:
      "Une réservation d'un événement de billetterie : participants et éléments payants (entrée, options) avec leur état et leur identifiant, pour encaisser, rembourser ou annuler. Sans coordonnées.",
    input: bookingInput,
    available: readAvailable,
    run: readBooking as McpActionDef["run"],
  },
  {
    name: "ticketing_payments",
    action: "ticketing_payments",
    kind: "read",
    description: "Paiements d'un événement de billetterie (trésorier, organisateur) : par défaut les déclarations « J'ai payé » à confirmer, avec leur identifiant.",
    input: paymentsInput,
    available: readAvailable,
    run: readPayments as McpActionDef["run"],
  },
  {
    name: "ticketing_accounts",
    action: "ticketing_accounts",
    kind: "read",
    description: "Comptes de l'église cherchés par nom, avec leur identifiant, pour attribuer un rôle ou affecter quelqu'un à un poste (organisateur).",
    input: accountsInput,
    available: readAvailable,
    run: readAccounts as McpActionDef["run"],
  },
];

// ─── Actions ─────────────────────────────────────────────────────────────────

const previewDesc = (what: string) => `Aperçu : ${what}. N'enregistre rien. Montrez le résumé et attendez l'accord explicite de la personne avant l'outil de confirmation.`;
const confirmDesc = (what: string) => `Confirme et exécute : ${what}, avec le jeton de l'aperçu, après l'accord explicite de la personne.`;

const local = z.string().regex(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/);
const localField = (what: string) => local.describe(`${what}, « AAAA-MM-JJ HH:MM », heure de Paris`);
const parisLocal = (v: string) => parisDateTime(v.slice(0, 10), v.slice(11));
/** Charge utile stockée dans le jeton : JSON pur (dates en ISO), relue par les schémas de l'écran. */
const jsonify = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const defined = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const userId = (ctx: ActionContext) => ctx.session.user.id;

function methodsText(pm: z.infer<typeof paymentMethodsSchema>): string {
  const parts = [
    pm.wero && "Wero",
    pm.revolut && "Revolut",
    pm.paypal && "PayPal",
    pm.transfer && `Virement (IBAN ${maskIban(pm.transfer.iban)}, titulaire ${pm.transfer.holder})`,
    pm.cash && "Espèces",
    pm.cheque && "Chèque",
  ].filter(Boolean);
  return parts.join(", ") || "aucun";
}

const DATE_KEYS = new Set(["startsAt", "endsAt", "registrationDeadline", "optionPaymentDeadline", "entryRefundDeadline", "refundDeadline"]);

/** Valeur lisible d'un champ (jamais d'IBAN en clair). */
function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(vide)";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (DATE_KEYS.has(key)) return when(v as Date | string);
  if (key === "price") return euros(Number(v));
  if (key === "tariffs") {
    const list = (v as { ageGroup: keyof typeof AGE_GROUP_LABEL; price: number }[]).map((t) => `${AGE_GROUP_LABEL[t.ageGroup]} ${euros(t.price)}`);
    return list.join(", ") || "aucun";
  }
  if (key === "paymentMethods") return methodsText(v as z.infer<typeof paymentMethodsSchema>);
  return String(v);
}

const diff = (labels: Record<string, string>, before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).map((k) => `${labels[k] ?? k} : ${show(k, before[k])} → ${show(k, after[k])}`);

const detailOf = async (eventId: string) => (await ticketing()).getEventDetail(eventId);

type OptionPayload = { eventId: string; op: "create" | "update" | "delete"; optionId?: string; data?: Record<string, unknown> };
type DishPayload = { eventId: string; op: "create" | "update" | "delete"; optionId?: string; variantId?: string; data?: Record<string, unknown> };
type PostPayload = { eventId: string; op: "create" | "rename" | "delete"; postId?: string; name?: string };
type AssignmentPayload = { eventId: string; op: "create" | "update" | "delete"; assignmentId?: string; data?: Record<string, unknown> };
type SalePayload = { eventId: string; opId: string; op: "deliver" | "sale"; itemId?: string; delivered?: number; optionId?: string; variantId?: string | null; quantity?: number; method: "CASH" | "CHEQUE" | null };
type CreatePayload = { eventId?: string; title: string; startsAt: string; endsAt: string; capacity: number };

// Événement : création -----------------------------------------------------------------------

const createEventInput = z.object({
  title: z.string().trim().min(1).max(150).describe("Titre de l'événement"),
  startsAt: localField("Début"),
  endsAt: localField("Fin"),
  capacity: z.number().int().min(1).max(100_000).describe("Jauge : nombre de places au total"),
});

const createEventAction = eventAction({
  action: "create_ticketing_event",
  role: "manager",
  description: previewDesc("créer un événement de billetterie en brouillon (titre, dates, jauge)"),
  confirmDescription: confirmDesc("créer l'événement de billetterie"),
  input: createEventInput,
  prepare: async (input): Promise<Prepared<CreatePayload> | string> => {
    const data = eventCreateSchema.parse({ title: input.title, startsAt: parisLocal(input.startsAt), endsAt: parisLocal(input.endsAt), capacity: input.capacity });
    const { slugify } = await ticketing();
    return {
      lines: [
        `Créer l'événement « ${data.title} »`,
        `Du ${when(data.startsAt)} au ${when(data.endsAt)}, jauge ${data.capacity}`,
        "Il sera créé en brouillon : personne ne peut encore s'inscrire (tarif adulte gratuit, aucun moyen de paiement).",
        `Adresse publique : ${publicOrigin()}/inscription/<église>/${slugify(data.title)} (suffixe numérique si l'adresse existe déjà)`,
      ],
      payload: jsonify({ title: data.title, startsAt: data.startsAt, endsAt: data.endsAt, capacity: data.capacity }) as unknown as CreatePayload,
    };
  },
  state: async () => null,
  execute: async (p, ctx) => {
    const m = await ticketing();
    const event = await m.createEvent(ctx.churchId, userId(ctx), eventCreateSchema.parse(p));
    const detail = await m.getEventDetail(event.id);
    return {
      text: `Événement « ${event.title} » créé en brouillon (identifiant ${event.id}). Adresse publique : ${publicOrigin()}/inscription/${detail.church.slug}/${event.slug}`,
      eventId: event.id,
    };
  },
});

// Événement : paramétrage --------------------------------------------------------------------

const UPDATE_LABELS: Record<string, string> = {
  title: "Titre",
  description: "Description",
  location: "Lieu",
  startsAt: "Début",
  endsAt: "Fin",
  registrationDeadline: "Date limite d'inscription",
  capacity: "Jauge",
  seatsOpen: "Places ouvertes",
  tariffs: "Tarifs",
  paymentMethods: "Moyens de paiement",
  optionPaymentDeadline: "Date limite de paiement des options",
  reminderDaysBefore: "Relance (jours avant)",
  allowOnsitePayment: "Paiement sur place",
  allowUnaccompaniedMinors: "Mineurs non accompagnés",
  allowWalkIns: "Ajout sur place",
  entryRefundable: "Entrée remboursable",
  entryRefundDeadline: "Date limite de remboursement de l'entrée",
  referencePrefix: "Préfixe des références",
  retentionDays: "Conservation des données (jours)",
};

const updateChanges = z
  .object({
    title: z.string().max(150),
    description: z.string().max(5000).nullable(),
    location: z.string().max(200).nullable(),
    startsAt: localField("Début"),
    endsAt: localField("Fin"),
    registrationDeadline: localField("Date limite d'inscription").nullable(),
    capacity: z.number().int().min(1).max(100_000),
    seatsOpen: z.number().int().min(0).max(100_000).describe("Places ouvertes à l'inscription (au plus la jauge, au moins les inscrits)"),
    tariffs: z.array(z.object({ ageGroup: z.enum(AGE_GROUPS), price: z.number().min(0).max(10_000).describe("Euros") })).max(4).describe("Un tarif par tranche d'âge"),
    paymentMethods: z
      .object({
        wero: z.object({ target: z.string() }).nullish(),
        revolut: z.object({ link: z.string().describe("Lien https") }).nullish(),
        paypal: z.object({ link: z.string().describe("Lien https") }).nullish(),
        transfer: z.object({ iban: z.string(), holder: z.string() }).nullish().describe("IBAN saisi ici, jamais relu ensuite"),
        cash: z.boolean().optional(),
        cheque: z.boolean().optional(),
      })
      .describe("Remplace l'ensemble des moyens de paiement : indiquer tous ceux à garder"),
    optionPaymentDeadline: localField("Date limite de paiement des options").nullable(),
    reminderDaysBefore: z.number().int().min(0).max(30),
    allowOnsitePayment: z.boolean(),
    allowUnaccompaniedMinors: z.boolean(),
    allowWalkIns: z.boolean(),
    entryRefundable: z.boolean(),
    entryRefundDeadline: localField("Date limite de remboursement de l'entrée").nullable(),
    referencePrefix: z.string().describe("2 à 8 lettres ou chiffres"),
    retentionDays: z.number().int().min(7).max(730),
  })
  .partial()
  .strict();

const updateAction = eventAction({
  action: "update_ticketing_event",
  role: "configure",
  description: previewDesc("modifier le paramétrage d'un événement de billetterie (infos, jauge, places, tarifs, moyens de paiement, règles) ; l'ouverture ou la fermeture passe par set_ticketing_status"),
  confirmDescription: confirmDesc("modifier l'événement de billetterie"),
  input: z.object({ event: eventRef, changes: updateChanges.describe("Seulement les champs à changer") }),
  prepare: async (input, _ctx, event) => {
    const raw: Record<string, unknown> = defined(input.changes);
    for (const k of DATE_KEYS) if (typeof raw[k] === "string") raw[k] = parisLocal(raw[k] as string);
    const data = eventUpdateSchema.parse(raw);
    const changes = defined(data) as Record<string, unknown>;
    if (Object.keys(changes).length === 0) return "Aucun changement demandé.";
    const before = await detailOf(event!.id);
    return {
      lines: [`${before.title} — modifications :`, ...diff(UPDATE_LABELS, before as unknown as Record<string, unknown>, changes)],
      payload: { eventId: event!.id, changes: jsonify(changes) },
    };
  },
  state: async (p) => {
    const e = await detailOf(p.eventId!);
    return { updatedAt: e.updatedAt, tariffs: e.tariffs };
  },
  execute: async (p, ctx) => {
    const data = eventUpdateSchema.parse(p.changes);
    const updated = await (await ticketing()).updateEvent(p.eventId!, userId(ctx), data);
    return { text: `« ${updated.title} » mis à jour (${Object.keys(data).map((k) => UPDATE_LABELS[k] ?? k).join(", ")}).`, vue: "parametres" };
  },
});

// Événement : état ---------------------------------------------------------------------------

const STATUS_OPS = {
  open: { from: ["DRAFT"], to: "OPEN", label: "Ouvrir les inscriptions" },
  close: { from: ["OPEN"], to: "CLOSED", label: "Fermer les inscriptions" },
  reopen: { from: ["CLOSED"], to: "OPEN", label: "Rouvrir les inscriptions" },
  archive: { from: ["OPEN", "CLOSED"], to: "ARCHIVED", label: "Clôturer l'événement" },
} as const;

const statusAction = eventAction({
  action: "set_ticketing_status",
  role: "configure",
  description: previewDesc("ouvrir, fermer, rouvrir les inscriptions ou clôturer un événement de billetterie (ouverture refusée tant qu'un point bloquant reste)"),
  confirmDescription: confirmDesc("changer l'état de l'événement de billetterie"),
  input: z.object({ event: eventRef, op: z.enum(["open", "close", "reopen", "archive"]).describe("open : ouvrir ; close : fermer les inscriptions ; reopen : les rouvrir ; archive : clôturer") }),
  prepare: async (input, _ctx, event) => {
    const e = await detailOf(event!.id);
    const op = STATUS_OPS[input.op];
    if (!(op.from as readonly string[]).includes(e.status)) return `Impossible : l'événement est « ${STATUS_LABEL[e.status]} ».`;
    const lines = [`${op.label} : « ${e.title} » passe de « ${STATUS_LABEL[e.status]} » à « ${STATUS_LABEL[op.to]} ».`];
    if (input.op === "open") {
      const blocking = blockingChecks(e);
      if (blocking.length) return `Ouverture refusée, à régler d'abord : ${blocking.map((c) => c.label).join(", ")}.`;
      lines.push("Les inscriptions sont ouvertes au public dès la confirmation.");
    }
    if (input.op === "archive") lines.push("Les rôles d'équipe prennent fin et l'événement passe en lecture seule pour l'organisation.");
    return { lines, payload: { eventId: e.id, op: input.op } };
  },
  state: async (p) => {
    const e = await detailOf(p.eventId!);
    return { status: e.status, updatedAt: e.updatedAt };
  },
  execute: async (p, ctx) => {
    const op = STATUS_OPS[p.op];
    const e = await detailOf(p.eventId!);
    if (!(op.from as readonly string[]).includes(e.status)) throw new ApiError(409, `L'événement est « ${STATUS_LABEL[e.status]} ».`);
    if (p.op === "open") {
      const blocking = blockingChecks(e);
      if (blocking.length) throw new ApiError(409, `Ouverture refusée : ${blocking.map((c) => c.label).join(", ")}.`);
    }
    await (await ticketing()).updateEvent(p.eventId!, userId(ctx), eventUpdateSchema.parse({ status: op.to }));
    return { text: `« ${e.title} » : ${STATUS_LABEL[op.to]}.` };
  },
});

// Options ------------------------------------------------------------------------------------

const OPTION_LABELS: Record<string, string> = {
  label: "Libellé",
  description: "Description",
  type: "Type",
  scope: "Portée",
  price: "Prix",
  stock: "Stock",
  pickup: "À retirer sur place",
  namedPrep: "Préparation nominative",
  refundable: "Remboursable",
  refundDeadline: "Date limite de remboursement",
  active: "Active",
  choiceGroup: "Groupe au choix unique",
};

const optionFields = z
  .object({
    label: z.string().max(120),
    description: z.string().max(500).nullable(),
    type: z.enum(OPTION_TYPES).describe("CHOICE (choix parmi des plats), QUANTITY ou CHECKBOX"),
    scope: z.enum(OPTION_SCOPES).describe("PARTICIPANT (par personne) ou BOOKING (par réservation)"),
    price: z.number().min(0).max(10_000).describe("Euros"),
    stock: z.number().int().min(0).max(100_000).nullable(),
    pickup: z.boolean().describe("À retirer sur place (restauration)"),
    namedPrep: z.boolean(),
    refundable: z.boolean(),
    refundDeadline: localField("Date limite de remboursement").nullable(),
    active: z.boolean(),
    choiceGroup: z.string().max(60).nullable(),
  })
  .partial()
  .strict();

const optionAction = eventAction({
  action: "edit_ticketing_option",
  role: "configure",
  description: previewDesc("créer, modifier ou supprimer une option (repas, supplément…) d'un événement de billetterie ; une option déjà choisie est désactivée, pas supprimée"),
  confirmDescription: confirmDesc("modifier les options de l'événement de billetterie"),
  input: z.object({
    event: eventRef,
    op: z.enum(["create", "update", "delete"]),
    optionId: z.string().trim().min(1).max(40).optional().describe("Identifiant de l'option (update, delete), voir ticketing_event"),
    option: optionFields.optional().describe("create : libellé, type, portée et prix requis ; update : les champs à changer"),
    variants: z.array(z.string().trim().min(1).max(120)).max(20).optional().describe("create : noms des plats d'une option à choix"),
  }),
  prepare: async (input, _ctx, event): Promise<Prepared<OptionPayload> | string> => {
    const e = await detailOf(event!.id);
    const raw: Record<string, unknown> = defined(input.option ?? {});
    if (typeof raw.refundDeadline === "string") raw.refundDeadline = parisLocal(raw.refundDeadline);
    if (input.op === "create") {
      const data = optionCreateSchema.parse({ ...raw, variants: input.variants?.map((label) => ({ label })) });
      return {
        lines: [
          `Créer l'option « ${data.label} » sur « ${e.title} » : ${data.type}, ${data.scope}, ${euros(data.price)}${data.stock != null ? `, stock ${data.stock}` : ""}`,
          ...(data.variants?.length ? [`Plats : ${data.variants.map((v) => v.label).join(", ")}`] : []),
        ],
        payload: { eventId: e.id, op: "create" as const, data: jsonify(data) as Record<string, unknown> },
      };
    }
    const option = e.options.find((o) => o.id === input.optionId);
    if (!option) return "Option introuvable : utilisez l'identifiant donné par ticketing_event.";
    if (input.op === "delete") {
      return {
        lines: [option.used > 0 ? `L'option « ${option.label} » est déjà choisie (${option.used}) : elle sera désactivée, pas supprimée.` : `Supprimer l'option « ${option.label} » (jamais choisie).`],
        payload: { eventId: e.id, op: "delete" as const, optionId: option.id },
      };
    }
    const data = defined(optionUpdateSchema.parse(raw)) as Record<string, unknown>;
    if (Object.keys(data).length === 0) return "Aucun changement demandé.";
    return {
      lines: [`Option « ${option.label} » — modifications :`, ...diff(OPTION_LABELS, option as unknown as Record<string, unknown>, data)],
      payload: { eventId: e.id, op: "update" as const, optionId: option.id, data: jsonify(data) },
    };
  },
  state: async (p) => (p.op === "create" ? null : ((await detailOf(p.eventId!)).options.find((o) => o.id === p.optionId) ?? null)),
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (p.op === "create") {
      const o = await m.createOption(p.eventId!, userId(ctx), optionCreateSchema.parse(p.data));
      return { text: `Option « ${o.label} » créée (identifiant ${o.id}).`, vue: "options" };
    }
    if (p.op === "update") {
      const o = await m.updateOption(p.eventId!, p.optionId!, userId(ctx), optionUpdateSchema.parse(p.data));
      return { text: `Option « ${o.label} » mise à jour.`, vue: "options" };
    }
    const r = await m.deleteOption(p.eventId!, p.optionId!, userId(ctx));
    return { text: r.deleted ? "Option supprimée." : "Option désactivée (déjà choisie par des inscrits).", vue: "options" };
  },
});

// Plats --------------------------------------------------------------------------------------

const DISH_LABELS: Record<string, string> = { label: "Nom", description: "Description", allergens: "Allergènes", stock: "Stock", prepared: "Préparés", closed: "Fermé", position: "Position" };

const dishAction = eventAction({
  action: "edit_ticketing_dish",
  role: "menu",
  description: previewDesc("ajouter, modifier, fermer (closed: true) ou supprimer un plat du menu d'une option à choix ; un plat déjà réservé se ferme seulement"),
  confirmDescription: confirmDesc("modifier le menu de l'événement de billetterie"),
  input: z.object({
    event: eventRef,
    op: z.enum(["create", "update", "delete"]),
    optionId: z.string().trim().min(1).max(40).optional().describe("create : identifiant de l'option à choix qui porte le plat"),
    variantId: z.string().trim().min(1).max(40).optional().describe("update, delete : identifiant du plat, voir ticketing_event"),
    dish: z
      .object({
        label: z.string().max(120),
        description: z.string().max(300).nullable(),
        allergens: z.string().max(200).nullable(),
        stock: z.number().int().min(0).max(100_000).nullable(),
        prepared: z.number().int().min(0).max(100_000).nullable(),
        closed: z.boolean().describe("Vrai : fermé aux nouvelles commandes"),
        position: z.number().int().min(0).max(1000),
      })
      .partial()
      .strict()
      .optional(),
  }),
  prepare: async (input, _ctx, event): Promise<Prepared<DishPayload> | string> => {
    const e = await detailOf(event!.id);
    const raw = defined(input.dish ?? {});
    if (input.op === "create") {
      const option = e.options.find((o) => o.id === input.optionId);
      if (!option) return "Option introuvable : utilisez l'identifiant donné par ticketing_event.";
      const data = variantCreateSchema.parse(raw);
      return {
        lines: [`Ajouter le plat « ${data.label} » à l'option « ${option.label} »${data.stock != null ? ` (stock ${data.stock})` : ""}${data.allergens ? `, allergènes : ${data.allergens}` : ""}`],
        payload: { eventId: e.id, op: "create" as const, optionId: option.id, data: jsonify(data) as Record<string, unknown> },
      };
    }
    const found = e.options.flatMap((o) => o.variants.map((v) => ({ ...v, optionLabel: o.label }))).find((v) => v.id === input.variantId);
    if (!found) return "Plat introuvable : utilisez l'identifiant donné par ticketing_event.";
    if (input.op === "delete") {
      return { lines: [`Supprimer le plat « ${found.label} » (option « ${found.optionLabel} »). Refusé s'il a déjà été réservé : fermez-le alors.`], payload: { eventId: e.id, op: "delete" as const, variantId: found.id } };
    }
    const data = defined(variantSchema.parse(raw)) as Record<string, unknown>;
    if (Object.keys(data).length === 0) return "Aucun changement demandé.";
    return {
      lines: [`Plat « ${found.label} » — modifications :`, ...diff(DISH_LABELS, found as unknown as Record<string, unknown>, data)],
      payload: { eventId: e.id, op: "update" as const, variantId: found.id, data: jsonify(data) },
    };
  },
  state: async (p) => {
    if (p.op === "create") return null;
    return (await detailOf(p.eventId!)).options.flatMap((o) => o.variants).find((v) => v.id === p.variantId) ?? null;
  },
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (p.op === "create") {
      const v = await m.addVariant(p.eventId!, p.optionId!, userId(ctx), variantCreateSchema.parse(p.data));
      return { text: `Plat « ${v.label} » ajouté (identifiant ${v.id}).`, vue: "options" };
    }
    if (p.op === "update") {
      const v = await m.updateVariant(p.eventId!, p.variantId!, userId(ctx), variantSchema.parse(p.data));
      return { text: `Plat « ${v.label} » mis à jour.`, vue: "options" };
    }
    await m.deleteVariant(p.eventId!, p.variantId!, userId(ctx));
    return { text: "Plat supprimé.", vue: "options" };
  },
});

// Équipe : rôles -----------------------------------------------------------------------------

const roleKey = (r: { userId: string; role: string }) => `${r.userId}:${r.role}`;

const rolesAction = eventAction({
  action: "set_ticketing_roles",
  role: "configure",
  description: previewDesc("attribuer ou retirer un rôle d'événement (organisateur, trésorier, accueil, restauration, observateur) à un compte de l'église ; la liste finale des rôles est montrée"),
  confirmDescription: confirmDesc("modifier les rôles de l'événement de billetterie"),
  input: z.object({
    event: eventRef,
    userId: z.string().trim().min(1).max(40).describe("Identifiant du compte, voir ticketing_accounts"),
    role: z.enum(ROLES),
    grant: z.boolean().describe("Vrai : attribuer le rôle ; faux : le retirer"),
  }),
  prepare: async (input, ctx, event) => {
    const e = await detailOf(event!.id);
    const current = e.roles.map((r) => ({ userId: r.userId, role: r.role }));
    const has = current.some((r) => r.userId === input.userId && r.role === input.role);
    const names = new Map(e.roles.map((r) => [r.userId, safeName(r.name)]));
    if (input.grant && has) return `${names.get(input.userId)} a déjà le rôle ${ROLE_LABEL[input.role]}.`;
    if (input.grant) {
      const accounts = await (await ticketing()).listChurchAccounts(ctx.churchId);
      const account = accounts.find((a) => a.id === input.userId);
      if (!account) return "Compte introuvable dans cette église : cherchez-le avec ticketing_accounts.";
      names.set(account.id, safeName(account.name));
    } else if (!names.has(input.userId)) return "Cette personne n'a aucun rôle sur cet événement.";
    if (!input.grant && !has) return `${names.get(input.userId)} n'a pas le rôle ${ROLE_LABEL[input.role]}.`;
    const next = input.grant ? [...current, { userId: input.userId, role: input.role }] : current.filter((r) => !(r.userId === input.userId && r.role === input.role));
    return {
      lines: [
        `${input.grant ? "Attribuer" : "Retirer"} le rôle ${ROLE_LABEL[input.role]} à ${names.get(input.userId)}${input.grant ? " (la personne en est prévenue)" : ""}`,
        `Rôles après changement : ${next.map((r) => `${names.get(r.userId) ?? "Compte"} (${ROLE_LABEL[r.role]})`).join(", ") || "aucun"}`,
      ],
      payload: { eventId: e.id, roles: next },
    };
  },
  state: async (p) => (await detailOf(p.eventId!)).roles.map(roleKey).sort(),
  execute: async (p, ctx) => {
    const { roles } = rolesSchema.parse({ roles: p.roles });
    await (await ticketing()).setRoles(p.eventId!, userId(ctx), roles);
    return { text: `Rôles mis à jour (${roles.length} au total).`, vue: "equipe" };
  },
});

// Équipe : postes et affectations ------------------------------------------------------------

const postAction = eventAction({
  action: "edit_ticketing_post",
  role: "configure",
  description: previewDesc("créer, renommer ou supprimer un poste de l'équipe d'un événement de billetterie ; supprimer un poste laisse ses affectations sans poste"),
  confirmDescription: confirmDesc("modifier les postes de l'événement de billetterie"),
  input: z.object({
    event: eventRef,
    op: z.enum(["create", "rename", "delete"]),
    postId: z.string().trim().min(1).max(40).optional().describe("Identifiant du poste (rename, delete), voir ticketing_event"),
    name: z.string().max(120).optional().describe("Nom du poste (create, rename)"),
  }),
  prepare: async (input, _ctx, event): Promise<Prepared<PostPayload> | string> => {
    const team = await (await ticketing()).listTeam(event!.id);
    if (input.op === "create") {
      const { name } = postSchema.parse({ name: input.name });
      return { lines: [`Créer le poste « ${name} »`], payload: { eventId: event!.id, op: "create" as const, name } };
    }
    const post = team.posts.find((p) => p.id === input.postId);
    if (!post) return "Poste introuvable : utilisez l'identifiant donné par ticketing_event.";
    if (input.op === "delete") return { lines: [`Supprimer le poste « ${post.name} » (ses affectations restent, sans poste)`], payload: { eventId: event!.id, op: "delete" as const, postId: post.id } };
    const { name } = postSchema.parse({ name: input.name });
    return { lines: [`Renommer le poste « ${post.name} » en « ${name} »`], payload: { eventId: event!.id, op: "rename" as const, postId: post.id, name } };
  },
  state: async (p) => (await (await ticketing()).listTeam(p.eventId!)).posts,
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (p.op === "create") return { text: `Poste « ${(await m.createPost(p.eventId!, userId(ctx), p.name!)).name} » créé.`, vue: "equipe" };
    if (p.op === "rename") return { text: `Poste renommé en « ${(await m.renamePost(p.eventId!, p.postId!, userId(ctx), p.name!)).name} ».`, vue: "equipe" };
    await m.deletePost(p.eventId!, p.postId!, userId(ctx));
    return { text: "Poste supprimé.", vue: "equipe" };
  },
});

const assignmentAction = eventAction({
  action: "edit_ticketing_assignment",
  role: "configure",
  description: previewDesc("affecter une personne (compte de l'église ou intervenant nommé) à l'équipe d'un événement de billetterie, changer son poste ou son créneau, ou retirer l'affectation ; la personne est prévenue comme dans l'application"),
  confirmDescription: confirmDesc("modifier les affectations de l'événement de billetterie"),
  input: z.object({
    event: eventRef,
    op: z.enum(["create", "update", "delete"]),
    assignmentId: z.string().trim().min(1).max(40).optional().describe("Identifiant de l'affectation (update, delete), voir ticketing_event"),
    postId: z.string().trim().min(1).max(40).nullable().optional().describe("Poste, voir ticketing_event ; null : sans poste"),
    userId: z.string().trim().min(1).max(40).optional().describe("create : compte de l'église, voir ticketing_accounts"),
    guestName: z.string().max(150).optional().describe("create : nom d'un intervenant extérieur (à la place d'un compte)"),
    startsAt: localField("Début du créneau").nullable().optional(),
    endsAt: localField("Fin du créneau").nullable().optional(),
  }),
  prepare: async (input, ctx, event): Promise<Prepared<AssignmentPayload> | string> => {
    const m = await ticketing();
    const team = await m.listTeam(event!.id);
    const slot = (s?: string | null, e?: string | null) => (s || e ? ` · créneau ${s ? when(parisLocal(s)) : "?"} → ${e ? when(parisLocal(e)) : "?"}` : "");
    const postName = (id?: string | null) => team.posts.find((p) => p.id === id)?.name;
    if (input.postId && !postName(input.postId)) return "Poste introuvable : utilisez l'identifiant donné par ticketing_event.";
    const dates = { startsAt: input.startsAt ? parisLocal(input.startsAt) : input.startsAt, endsAt: input.endsAt ? parisLocal(input.endsAt) : input.endsAt };
    if (input.op === "create") {
      const data = assignmentSchema.parse({ postId: input.postId, userId: input.userId, guestName: input.guestName, ...dates });
      let who = data.guestName ? `${data.guestName} (intervenant)` : "";
      if (data.userId) {
        const account = (await m.listChurchAccounts(ctx.churchId)).find((a) => a.id === data.userId);
        if (!account) return "Compte introuvable dans cette église : cherchez-le avec ticketing_accounts.";
        who = safeName(account.name);
      }
      return {
        lines: [`Affecter ${who}${data.postId ? ` au poste « ${postName(data.postId)} »` : " sans poste précis"}${slot(input.startsAt, input.endsAt)}${data.userId ? " (la personne en est prévenue)" : ""}`],
        payload: { eventId: event!.id, op: "create" as const, data: jsonify(data) as Record<string, unknown> },
      };
    }
    const a = team.assignments.find((x) => x.id === input.assignmentId);
    if (!a) return "Affectation introuvable : utilisez l'identifiant donné par ticketing_event.";
    if (input.op === "delete") return { lines: [`Retirer l'affectation de ${safeName(a.name)}`], payload: { eventId: event!.id, op: "delete" as const, assignmentId: a.id } };
    const data = defined(assignmentUpdateSchema.parse(defined({ postId: input.postId, ...dates }))) as Record<string, unknown>;
    if (Object.keys(data).length === 0) return "Aucun changement demandé.";
    const lines = [`Affectation de ${safeName(a.name)} — modifications :`];
    if ("postId" in data) lines.push(`Poste : ${a.postName ?? "(aucun)"} → ${postName(data.postId as string | null) ?? "(aucun)"}`);
    if ("startsAt" in data) lines.push(`Début : ${a.startsAt ? when(a.startsAt) : "(vide)"} → ${data.startsAt ? when(data.startsAt as Date) : "(vide)"}`);
    if ("endsAt" in data) lines.push(`Fin : ${a.endsAt ? when(a.endsAt) : "(vide)"} → ${data.endsAt ? when(data.endsAt as Date) : "(vide)"}`);
    if (!a.guest) lines.push("La personne en est prévenue.");
    return { lines, payload: { eventId: event!.id, op: "update" as const, assignmentId: a.id, data: jsonify(data) } };
  },
  state: async (p) => {
    if (p.op === "create") return null;
    const a = (await (await ticketing()).listTeam(p.eventId!)).assignments.find((x) => x.id === p.assignmentId);
    return a ? { id: a.id, postId: a.postId, startsAt: a.startsAt, endsAt: a.endsAt } : null;
  },
  execute: async (p, ctx) => {
    const m = await ticketing();
    if (p.op === "create") {
      const a = await m.createAssignment(p.eventId!, userId(ctx), assignmentSchema.parse(p.data));
      return { text: `Affectation créée (identifiant ${a.id}).`, vue: "equipe" };
    }
    if (p.op === "update") {
      await m.updateAssignment(p.eventId!, p.assignmentId!, userId(ctx), assignmentUpdateSchema.parse(p.data));
      return { text: "Affectation mise à jour.", vue: "equipe" };
    }
    await m.deleteAssignment(p.eventId!, p.assignmentId!, userId(ctx));
    return { text: "Affectation retirée.", vue: "equipe" };
  },
});

// Paiements ----------------------------------------------------------------------------------

const MAX_PAYMENTS = 50;

const handlePaymentsAction = eventAction({
  action: "handle_ticketing_payments",
  role: "payments",
  description: previewDesc(`confirmer ou refuser des déclarations « J'ai payé » d'un événement de billetterie (1 à ${MAX_PAYMENTS} à la fois, tout ou rien) ; les emails aux contacts partent comme dans l'application`),
  confirmDescription: confirmDesc("confirmer ou refuser la série de déclarations de paiement"),
  input: z.object({
    event: eventRef,
    paymentIds: z.array(z.string().trim().min(1).max(40)).min(1).max(MAX_PAYMENTS).describe("Identifiants des déclarations, voir ticketing_payments"),
    decision: z.enum(["confirm", "reject"]),
    reason: z.string().max(300).optional().describe("Motif, requis pour un refus (transmis au contact)"),
  }),
  prepare: async (input, _ctx, event) => {
    const ids = [...new Set(input.paymentIds)];
    const action = paymentActionSchema.parse(input.decision === "reject" ? { action: "reject", reason: input.reason } : { action: "confirm" });
    const rows = await (await ticketing()).listPayments(event!.id);
    const picked = ids.map((id) => rows.find((p) => p.id === id));
    const missing = ids.filter((_, i) => !picked[i]);
    if (missing.length) return `Paiement introuvable dans cet événement : ${missing.join(", ")}. Rien n'est fait.`;
    const done = picked.filter((p) => p!.kind !== "DECLARATION" || p!.status !== "PENDING");
    if (done.length) return `Déjà traité ou pas une déclaration : ${done.map((p) => p!.reference).join(", ")}. Rien n'est fait : refaites la liste avec ticketing_payments.`;
    const total = picked.reduce((n, p) => n + p!.amount, 0);
    return {
      lines: [
        `${input.decision === "confirm" ? "Confirmer" : "Refuser"} ${ids.length} déclaration(s) de paiement, ${euros(total)} au total${action.action === "reject" ? ` — motif : ${action.reason}` : ""}`,
        ...picked.map((p) => `${p!.reference} · ${p!.contactName} · ${PAYMENT_METHOD_LABEL[p!.method]} · ${euros(p!.amount)}`),
        "Les contacts sont prévenus par email, comme dans l'application. Tout ou rien : si l'une change avant la confirmation, aucune n'est traitée.",
      ],
      payload: { eventId: event!.id, ids, decision: input.decision, reason: action.action === "reject" ? action.reason : null },
    };
  },
  state: async (p) => {
    const rows = await (await ticketing()).listPayments(p.eventId!);
    return p.ids.map((id) => rows.find((r) => r.id === id)).map((r) => (r ? { id: r.id, status: r.status, amount: r.amount } : null)).sort((a, b) => byText(a?.id ?? "", b?.id ?? ""));
  },
  execute: async (p, ctx) => {
    const m = await ticketing();
    const processed: string[] = [];
    for (const id of p.ids) {
      try {
        if (p.decision === "confirm") await m.confirmPayment(p.eventId!, id, userId(ctx));
        else await m.rejectPayment(p.eventId!, id, userId(ctx), p.reason!);
        processed.push(id);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        return { text: `${processed.length} sur ${p.ids.length} traitée(s) ; arrêt sur ${id} : ${error.message} Refaites la liste avec ticketing_payments.`, vue: "reglements", data: processed };
      }
    }
    return { text: `${processed.length} déclaration(s) ${p.decision === "confirm" ? "confirmée(s)" : "refusée(s)"}.`, vue: "reglements", data: processed };
  },
  audit: (p, _ctx, data) =>
    ((data as string[] | undefined) ?? []).map((id) => ({ action: "UPDATE" as const, entityType: "TicketingPayment", entityId: id, details: { eventId: p.eventId, decision: p.decision } })),
});

/** Encaissement ou remboursement sur des éléments payants d'une réservation. */
function settlementAction(spec: { action: string; role: EventAction; what: string; from: readonly string[]; verb: string }) {
  const chargeInput = z.object({ type: z.enum(["entry", "item"]), id: z.string().trim().min(1).max(40) });
  return eventAction({
    action: spec.action,
    role: spec.role,
    description: previewDesc(spec.what),
    confirmDescription: confirmDesc(spec.what),
    input: z.object({
      event: eventRef,
      bookingId: z.string().trim().min(1).max(64).describe("Identifiant de la réservation, voir ticketing_bookings"),
      method: z.enum(PAYMENT_METHODS),
      charges: z.array(chargeInput).min(1).max(100).describe("Éléments payants (type et identifiant), voir ticketing_booking"),
    }),
    prepare: async (input, _ctx, event) => {
      const scope = scopeOf(event!.access);
      if (!scope) return NOT_ROLE;
      const { view, charges } = await loadBookingFor(event!.id, input.bookingId, event!.access);
      const picked = input.charges.map((c) => charges.find((r) => r.type === c.type && r.id === c.id));
      if (picked.some((c) => !c)) return "Élément introuvable dans cette réservation, ou hors de votre périmètre : voir ticketing_booking.";
      const off = picked.filter((c) => !spec.from.includes(c!.status));
      if (off.length) return `${spec.verb} impossible : ${off.map((c) => `${c!.label} (${c!.status})`).join(", ")}.`;
      const data = (spec.action === "mark_ticketing_refunded" ? refundSchema : receiptSchema).parse({ method: input.method, charges: input.charges });
      return {
        lines: [
          `${spec.verb} sur la réservation ${view.reference} (${view.contact.name}) par ${PAYMENT_METHOD_LABEL[input.method]} : ${euros(picked.reduce((n, c) => n + c!.amount, 0))}`,
          ...picked.map((c) => `${c!.label} · ${euros(c!.amount)}`),
        ],
        payload: { eventId: event!.id, bookingId: view.id, method: data.method, charges: data.charges, opId: randomUUID() },
      };
    },
    state: async (p, ctx) => {
      const found = await eventFor(ctx, p.eventId!, "read");
      if (typeof found === "string") return found;
      const { charges } = await loadBookingFor(p.eventId!, p.bookingId, found.access);
      return { scope: scopeOf(found.access), charges: p.charges.map((c) => charges.find((r) => r.type === c.type && r.id === c.id)?.status ?? null) };
    },
    execute: async (p, ctx) => {
      const found = await eventFor(ctx, p.eventId!, "read");
      if (typeof found === "string") throw new ApiError(403, found);
      const m = await ticketing();
      const scope = scopeOf(found.access);
      if (!scope) throw new ApiError(403, NOT_ROLE);
      const payment =
        spec.action === "mark_ticketing_refunded"
          ? await m.markRefunded(p.eventId!, p.bookingId, { method: p.method, charges: p.charges }, userId(ctx))
          : await m.recordReceipt(p.eventId!, p.bookingId, { method: p.method, charges: p.charges, opId: p.opId }, userId(ctx), scope);
      return { text: `${spec.verb} enregistré : ${euros(Number(payment.amount))} par ${PAYMENT_METHOD_LABEL[p.method]}.`, vue: "reglements", data: payment.id };
    },
    audit: (p, _ctx, data) => ({ action: "CREATE", entityType: "TicketingPayment", entityId: String(data), details: { eventId: p.eventId, bookingId: p.bookingId, kind: spec.action === "mark_ticketing_refunded" ? "REFUND" : "RECEIPT" } }),
  });
}

const receiptAction = settlementAction({
  action: "record_ticketing_receipt",
  role: "read",
  what: "enregistrer un encaissement direct (espèces, chèque…) sur des éléments à régler ou déclarés d'une réservation ; la trésorerie encaisse tout, l'accueil les entrées, la restauration les retraits sur place",
  from: ["DUE", "DECLARED"],
  verb: "Encaissement",
});
const refundAction = settlementAction({
  action: "mark_ticketing_refunded",
  role: "payments",
  what: "marquer comme remboursés des éléments « à rembourser » d'une réservation (le remboursement lui-même se fait hors de Koinonia)",
  from: ["REFUND_DUE"],
  verb: "Remboursement",
});

// Réservations -------------------------------------------------------------------------------

const cancelAction = eventAction({
  action: "cancel_ticketing_booking",
  role: "payments",
  description: previewDesc("annuler une réservation entière ou la participation d'une personne, au nom de l'organisation ; le contact est prévenu par email et les montants déjà payés sont à rembourser selon les règles de l'événement"),
  confirmDescription: confirmDesc("annuler la réservation ou la participation"),
  input: z.object({
    event: eventRef,
    bookingId: z.string().trim().min(1).max(64).describe("Identifiant de la réservation, voir ticketing_bookings"),
    participantId: z.string().trim().min(1).max(40).optional().describe("Annuler seulement cette personne (sinon toute la réservation)"),
  }),
  prepare: async (input, _ctx, event) => {
    const { view } = await loadBookingFor(event!.id, input.bookingId, event!.access);
    if (view.status !== "ACTIVE") return "Cette réservation est déjà annulée.";
    const active = view.participants.filter((p) => p.status === "ACTIVE");
    const target = input.participantId ? active.filter((p) => p.id === input.participantId) : active;
    if (target.length === 0) return "Participant introuvable ou déjà annulé : voir ticketing_booking.";
    const whole = !input.participantId || target.length === active.length;
    const ids = new Set(target.map((p) => p.id));
    const hit = [
      ...target.filter((p) => p.entryStatus === "PAID").map((p) => ({ label: `Entrée ${p.firstName} ${p.lastName}`, amount: p.entryPrice, refundable: p.refundableNow })),
      ...view.items.filter((i) => i.active && i.status === "PAID" && ((i.participantId && ids.has(i.participantId)) || (whole && !i.participantId))).map((i) => ({ label: i.label, amount: i.amount, refundable: i.refundableNow })),
    ];
    const sum = (rows: typeof hit) => rows.reduce((n, r) => n + r.amount, 0);
    return {
      lines: [
        input.participantId ? `Annuler la participation de ${target[0].firstName} ${target[0].lastName} (réservation ${view.reference})` : `Annuler toute la réservation ${view.reference} (${view.contact.name}, ${target.length} participant(s))`,
        `À rembourser ensuite : ${euros(sum(hit.filter((r) => r.refundable)))} · conservé (non remboursable ou hors délai) : ${euros(sum(hit.filter((r) => !r.refundable)))}`,
        ...hit.map((r) => `${r.label} · ${euros(r.amount)} · ${r.refundable ? "à rembourser" : "conservé"}`),
        "Le contact est prévenu par email ; les places et plats sont libérés.",
      ],
      payload: { eventId: event!.id, bookingId: view.id, participantId: input.participantId ?? null },
    };
  },
  state: async (p, ctx) => {
    const found = await eventFor(ctx, p.eventId!, "read");
    if (typeof found === "string") return found;
    const { view } = await loadBookingFor(p.eventId!, p.bookingId, found.access);
    return { status: view.status, participants: view.participants.map((x) => [x.id, x.status, x.entryStatus]), items: view.items.map((i) => [i.id, i.status, i.active]) };
  },
  execute: async (p) => {
    const r = await (await ticketing()).cancelByOrganizer(p.bookingId, p.participantId);
    return { text: r.message, vue: "inscrits" };
  },
  audit: (p) => ({ action: "UPDATE", entityType: "TicketingBooking", entityId: p.bookingId, details: { eventId: p.eventId, cancelled: p.participantId ?? "all" } }),
});

/** Opération de terrain par la synchronisation de l'écran, avec les rôles actuels de l'appelant. */
async function runOp(ctx: ActionContext, eventId: string, op: Record<string, unknown>): Promise<{ status: string }> {
  const access = await accessTo(ctx, eventId);
  if (!access) throw new ApiError(404, NOT_FOUND);
  const input = syncSchema.parse({ deviceId: "assistant-ia", clientTime: new Date(), ops: [op] });
  const { results } = await (await ticketing()).applyOperations(eventId, input, { userId: userId(ctx), roles: access.roles });
  const r = results[0];
  if (r.status === "rejected") throw new ApiError(409, r.reason ?? "Opération refusée.");
  return r;
}

const METHOD_FIELD = z.enum(["CASH", "CHEQUE"]);

const walkinAction = eventAction({
  action: "add_ticketing_walkin",
  role: "reception",
  description: previewDesc("ajouter à l'entrée des personnes non inscrites (1 à 10) à un événement de billetterie, avec règlement espèces ou chèque s'il y en a un ; refusé si l'ajout sur place n'est pas autorisé"),
  confirmDescription: confirmDesc("ajouter les personnes sur place"),
  input: z.object({
    event: eventRef,
    participants: z.array(z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), ageGroup: z.enum(AGE_GROUPS) })).min(1).max(10),
    method: METHOD_FIELD.optional().describe("Règlement encaissé à l'entrée"),
    enter: z.boolean().optional().describe("Compter les personnes présentes (vrai par défaut)"),
  }),
  prepare: async (input, _ctx, event) => {
    const e = await detailOf(event!.id);
    if (!e.allowWalkIns) return "L'ajout sur place n'est pas autorisé pour cet événement (réglage « Ajout sur place »).";
    if (e.status !== "OPEN" && e.status !== "CLOSED") return "L'événement n'est pas ouvert.";
    const price = (g: string) => e.tariffs.find((t) => t.ageGroup === g)?.price ?? 0;
    const total = input.participants.reduce((n, p) => n + price(p.ageGroup), 0);
    return {
      lines: [
        `Ajouter ${input.participants.length} personne(s) à « ${e.title} » : ${input.participants.map((p) => `${p.firstName} ${p.lastName} (${AGE_GROUP_LABEL[p.ageGroup]})`).join(", ")}`,
        `Entrées : ${euros(total)}${total > 0 ? (input.method ? `, encaissées par ${PAYMENT_METHOD_LABEL[input.method]}` : ", restent à régler") : ""}`,
        input.enter === false ? "Non comptées présentes." : "Comptées présentes à l'entrée.",
      ],
      payload: { eventId: e.id, opId: randomUUID(), participants: input.participants, method: input.method ?? null, enter: input.enter ?? true },
    };
  },
  state: async (p) => {
    const e = await detailOf(p.eventId!);
    return { allowWalkIns: e.allowWalkIns, status: e.status };
  },
  execute: async (p, ctx) => {
    const r = await runOp(ctx, p.eventId!, { type: "walkin", id: p.opId, participants: p.participants, method: p.method, enter: p.enter, scannedAt: new Date() });
    return { text: r.status === "duplicate" ? "Déjà enregistré." : `${p.participants.length} personne(s) ajoutée(s) sur place.`, vue: "presences" };
  },
  audit: (p) => ({ action: "CREATE", entityType: "TicketingBooking", entityId: `walkin-${p.opId}`, details: { eventId: p.eventId, participants: p.participants.length } }),
});

const cateringSaleAction = eventAction({
  action: "ticketing_catering_sale",
  role: "catering",
  description: previewDesc("à la restauration : remettre un article réservé (avec encaissement s'il reste à régler) ou enregistrer une vente sur place d'un plat ou d'une option à retirer"),
  confirmDescription: confirmDesc("enregistrer la remise ou la vente"),
  input: z.object({
    event: eventRef,
    op: z.enum(["deliver", "sale"]),
    itemId: z.string().trim().min(1).max(64).optional().describe("deliver : identifiant de l'élément réservé, voir ticketing_catering"),
    delivered: z.number().int().min(1).max(20).optional().describe("deliver : quantité totale remise après ce geste (toute la quantité par défaut)"),
    optionId: z.string().trim().min(1).max(64).optional().describe("sale : option vendue, voir ticketing_catering"),
    variantId: z.string().trim().min(1).max(64).optional().describe("sale : plat, obligatoire si l'option a des plats"),
    quantity: z.number().int().min(1).max(50).optional().describe("sale : quantité vendue"),
    method: METHOD_FIELD.optional().describe("Espèces ou chèque : requis pour une vente et pour remettre un élément à régler"),
  }),
  prepare: async (input, _ctx, event): Promise<Prepared<SalePayload> | string> => {
    const snap = await (await ticketing()).cateringSnapshot(event!.id);
    if (input.op === "deliver") {
      const item = snap.items.find((i) => i.id === input.itemId);
      if (!item) return "Élément introuvable : voir ticketing_catering.";
      const delivered = Math.min(item.quantity, Math.max(item.deliveredQty, input.delivered ?? item.quantity));
      if (delivered === item.deliveredQty) return "Cette quantité est déjà remise.";
      if (item.amountDue > 0 && !input.method) return `Élément à régler (${euros(item.amountDue)}) : indiquez le règlement (espèces ou chèque) pour encaisser avant de remettre.`;
      return {
        lines: [`Remettre « ${item.label} » à ${item.holder} : ${delivered} sur ${item.quantity}${item.amountDue > 0 ? ` · encaisser ${euros(item.amountDue)} par ${PAYMENT_METHOD_LABEL[input.method!]}` : ""}`],
        payload: { eventId: event!.id, opId: randomUUID(), op: "deliver" as const, itemId: item.id, delivered, method: item.amountDue > 0 ? (input.method ?? null) : null },
      };
    }
    const option = snap.sale.find((o) => o.id === input.optionId);
    if (!option) return "Option introuvable ou non vendable sur place : voir ticketing_catering.";
    if (!input.quantity || !input.method) return "Indiquez la quantité et le règlement (espèces ou chèque).";
    const variant = option.variants.find((v) => v.id === input.variantId);
    if (input.variantId && !variant) return "Plat introuvable ou fermé : voir ticketing_catering.";
    if (!input.variantId && option.variants.length > 0) return "Choisissez le plat (variantId).";
    return {
      lines: [`Vente sur place : ${input.quantity} × ${variant ? `${option.label} — ${variant.label}` : option.label} = ${euros(option.price * input.quantity)} par ${PAYMENT_METHOD_LABEL[input.method]}`],
      payload: { eventId: event!.id, opId: randomUUID(), op: "sale" as const, optionId: option.id, variantId: variant?.id ?? null, quantity: input.quantity, method: input.method },
    };
  },
  state: async (p) => {
    if (p.op === "sale") return null;
    const item = (await (await ticketing()).cateringSnapshot(p.eventId!)).items.find((i) => i.id === p.itemId);
    return item ? { deliveredQty: item.deliveredQty, amountDue: item.amountDue } : null;
  },
  execute: async (p, ctx) => {
    const base = { id: p.opId, scannedAt: new Date() };
    const r = await runOp(ctx, p.eventId!, p.op === "deliver" ? { type: "delivery", ...base, itemId: p.itemId, delivered: p.delivered, method: p.method } : { type: "onsiteSale", ...base, optionId: p.optionId, variantId: p.variantId, quantity: p.quantity, method: p.method });
    return { text: r.status === "duplicate" ? "Déjà enregistré." : p.op === "deliver" ? "Remise enregistrée." : "Vente enregistrée.", vue: "restauration" };
  },
  audit: (p) => ({ action: p.op === "deliver" ? "UPDATE" : "CREATE", entityType: p.op === "deliver" ? "TicketingItem" : "TicketingOnsiteSale", entityId: p.op === "deliver" ? p.itemId! : p.opId, details: { eventId: p.eventId } }),
});

export const TICKETING_ACTIONS: McpActionDef[] = [
  ...TICKETING_READS,
  ...createEventAction,
  ...updateAction,
  ...statusAction,
  ...optionAction,
  ...dishAction,
  ...rolesAction,
  ...postAction,
  ...assignmentAction,
  ...handlePaymentsAction,
  ...receiptAction,
  ...refundAction,
  ...cancelAction,
  ...walkinAction,
  ...cateringSaleAction,
];
