import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";
import { logAudit, withAuditContext } from "@/lib/audit";
import { maskIban } from "@/lib/iban";
import { consumeConfirmation, createConfirmation, publicOrigin } from "@/modules/mcp";
import type { EventAccess, EventAction } from "@/modules/ticketing";
import { formatDay, formatTime } from "../../assistant/_data/common";
import { CHANGED, EXPIRED, confirmInput, fingerprint, previewText, refusal, type ActionContext, type ActionResult, type McpActionDef } from "./common";

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
  execute: (payload: P, ctx: ActionContext) => Promise<{ text: string; eventId?: string; vue?: string }>;
  /** Entrée d'audit pour les services qui ne journalisent pas eux-mêmes. */
  audit?: (payload: P, ctx: ActionContext) => { action: "CREATE" | "UPDATE" | "DELETE"; entityType: string; entityId: string; details?: Record<string, unknown> };
}

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
    let result: { text: string; eventId?: string; vue?: string };
    try {
      result = await withAuditContext({ via: "mcp" }, async () => {
        const done = await spec.execute(stored.payload, ctx);
        const entry = spec.audit?.(stored.payload, ctx);
        if (entry) await logAudit({ userId: ctx.viewer.userId, churchId: ctx.churchId, ...entry });
        return done;
      });
    } catch (error) {
      if (error instanceof ApiError) return refusal(`${error.message} Rien n'est fait : refaites l'aperçu.`);
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
  const board = await (await ticketing()).cateringBoard(found.id);
  return {
    text:
      board.toPrepare.map((s) => `${s.label} : ${s.available ?? "∞"} disponible(s), ${s.delivered} remis, ${s.reserved} réservé(s), ${s.sold} vendu(s)`).join("\n") ||
      "Aucun plat.",
    structured: { toPrepare: board.toPrepare, notCollected: board.notCollected.length, sales: board.sales },
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
    name: "ticketing_accounts",
    action: "ticketing_accounts",
    kind: "read",
    description: "Comptes de l'église cherchés par nom, avec leur identifiant, pour attribuer un rôle ou affecter quelqu'un à un poste (organisateur).",
    input: accountsInput,
    available: readAvailable,
    run: readAccounts as McpActionDef["run"],
  },
];

export const TICKETING_ACTIONS: McpActionDef[] = [...TICKETING_READS];
