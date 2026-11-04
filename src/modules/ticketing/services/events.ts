import { Prisma, type TicketingEvent, type TicketingRole } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";
import {
  enabledMethods,
  readPaymentMethods,
  readQuestions,
  type EventUpdateInput,
  type PublicEvent,
  type optionCreateSchema,
  type optionUpdateSchema,
} from "../schemas";
import type { z } from "zod";
import { computeUsage, remaining } from "./stock";

/**
 * Événements de billetterie (spec 074) : création, paramétrage, options, rôles, et lecture
 * publique avec places et stock restants.
 */

async function db() {
  return (await import("@/lib/prisma")).prisma;
}

async function audit(userId: string, churchId: string, action: "CREATE" | "UPDATE" | "DELETE", entityType: string, entityId: string, details?: Record<string, unknown>) {
  const { logAudit } = await import("@/lib/audit");
  await logAudit({ userId, churchId, action, entityType, entityId, details });
}

/** `Nuit de la traversée` → `nuit-de-la-traversee`. */
export function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 70) || "evenement"
  );
}

/** Initiales du titre et année : `Nuit de la traversée` 2026 → `NT26`. */
export function defaultPrefix(title: string, startsAt: Date): string {
  const stop = new Set(["de", "la", "le", "les", "du", "des", "et", "a", "au", "aux", "en", "l", "d"]);
  const initials = slugify(title)
    .split("-")
    .filter((w) => w && !stop.has(w))
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
  return `${initials || "EV"}${String(startsAt.getFullYear()).slice(-2)}`;
}

async function uniqueSlug(churchId: string, base: string, excludeId?: string): Promise<string> {
  const prisma = await db();
  let slug = base;
  for (let n = 2; n < 100; n++) {
    const clash = await prisma.ticketingEvent.findFirst({
      where: { churchId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
    slug = `${base.slice(0, 74)}-${n}`;
  }
  throw new ApiError(409, "Adresse publique indisponible");
}

export async function createEvent(
  churchId: string,
  userId: string,
  input: { title: string; startsAt: Date; endsAt: Date; capacity: number }
) {
  const prisma = await db();
  const slug = await uniqueSlug(churchId, slugify(input.title));
  const event = await prisma.ticketingEvent.create({
    data: {
      churchId,
      slug,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      seatsOpen: input.capacity,
      paymentMethods: { cash: false, cheque: false },
      questions: [],
      referencePrefix: defaultPrefix(input.title, input.startsAt),
      createdById: userId,
      tariffs: { create: [{ ageGroup: "ADULT", price: 0 }] },
    },
  });
  await audit(userId, churchId, "CREATE", "TicketingEvent", event.id, { title: event.title });
  return event;
}

/** Événements visibles : tous ceux de l'église pour `ticketing:manage`, sinon ceux où l'on a un rôle. */
export async function listEvents(churchId: string, userId: string, manager: boolean) {
  const prisma = await db();
  const events = await prisma.ticketingEvent.findMany({
    where: {
      churchId,
      ...(manager ? {} : { roles: { some: { userId } }, status: { not: "ARCHIVED" } }),
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      startsAt: true,
      endsAt: true,
      status: true,
      seatsOpen: true,
      capacity: true,
      _count: { select: { participants: { where: { status: "ACTIVE" } } } },
    },
  });
  return events.map(({ _count, ...e }) => ({ ...e, seatsTaken: _count.participants }));
}

/** Événement complet pour le tableau de bord (selon les rôles, la route filtre ce qu'elle renvoie). */
export async function getEventDetail(eventId: string) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      church: { select: { slug: true, name: true } },
      tariffs: true,
      options: { orderBy: { position: "asc" }, include: { variants: { orderBy: { position: "asc" } } } },
      roles: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  const usage = await computeUsage(eventId, prisma);
  return {
    ...event,
    paymentMethods: readPaymentMethods(event.paymentMethods),
    questions: readQuestions(event.questions),
    seatsTaken: usage.seatsTaken,
    tariffs: event.tariffs.map((t) => ({ ageGroup: t.ageGroup, price: Number(t.price) })),
    options: event.options.map((o) => ({
      ...o,
      price: Number(o.price),
      used: usage.options.get(o.id) ?? 0,
      variants: o.variants.map((v) => ({ ...v, used: usage.variants.get(v.id) ?? 0 })),
    })),
    roles: event.roles.map((r) => ({ userId: r.userId, role: r.role, name: r.user.name, email: r.user.email })),
  };
}
export type EventDetail = Awaited<ReturnType<typeof getEventDetail>>;

/** Paramétrage par l'organisateur. Les places ouvertes ne descendent pas sous les inscrits. */
export async function updateEvent(eventId: string, userId: string, input: EventUpdateInput) {
  const prisma = await db();
  const current = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId } });
  const capacity = input.capacity ?? current.capacity;
  const seatsOpen = input.seatsOpen ?? current.seatsOpen;
  if (seatsOpen > capacity) throw new ApiError(400, "Les places ouvertes ne dépassent pas la jauge");
  const startsAt = input.startsAt ?? current.startsAt;
  const endsAt = input.endsAt ?? current.endsAt;
  if (endsAt <= startsAt) throw new ApiError(400, "La fin doit suivre le début");
  if (input.seatsOpen !== undefined) {
    const taken = await prisma.ticketingParticipant.count({ where: { eventId, status: "ACTIVE" } });
    if (seatsOpen < taken) throw new ApiError(400, `Déjà ${taken} inscrits : les places ouvertes ne descendent pas en dessous`);
  }

  const { tariffs, paymentMethods, questions, status, ...rest } = input;
  const data: Prisma.TicketingEventUpdateInput = { ...rest };
  if (paymentMethods) data.paymentMethods = paymentMethods as Prisma.InputJsonValue;
  if (questions) data.questions = questions as Prisma.InputJsonValue;
  if (status && status !== current.status) {
    data.status = status;
    if (status === "ARCHIVED") data.closedAt = new Date();
    if (current.status === "ARCHIVED") data.closedAt = null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (tariffs) {
      await tx.ticketingTariff.deleteMany({ where: { eventId, ageGroup: { notIn: tariffs.map((t) => t.ageGroup) } } });
      for (const t of tariffs) {
        await tx.ticketingTariff.upsert({
          where: { eventId_ageGroup: { eventId, ageGroup: t.ageGroup } },
          create: { eventId, ageGroup: t.ageGroup, price: t.price },
          update: { price: t.price },
        });
      }
    }
    return tx.ticketingEvent.update({ where: { id: eventId }, data });
  });
  await audit(userId, current.churchId, "UPDATE", "TicketingEvent", eventId, {
    fields: Object.keys(input),
    ...(status && status !== current.status ? { status: [current.status, status] } : {}),
  });
  return updated;
}

// ── Options ──────────────────────────────────────────────────────────────────

async function optionChurch(optionId: string, eventId: string) {
  const prisma = await db();
  const option = await prisma.ticketingOption.findUnique({
    where: { id: optionId },
    include: { event: { select: { churchId: true, id: true } } },
  });
  if (option?.eventId !== eventId) throw new ApiError(404, "Option introuvable");
  return option;
}

export async function createOption(eventId: string, userId: string, input: z.infer<typeof optionCreateSchema>) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true } });
  const { variants, ...fields } = input;
  // Une option à choix peut être créée sans plat : la restauration compose le menu ensuite.
  const position = fields.position ?? (await prisma.ticketingOption.count({ where: { eventId } }));
  const option = await prisma.ticketingOption.create({
    data: {
      ...fields,
      eventId,
      position,
      variants: variants?.length ? { create: variants.map((v, i) => ({ label: v.label, position: i })) } : undefined,
    },
  });
  await audit(userId, event.churchId, "CREATE", "TicketingOption", option.id, { eventId, label: option.label });
  return option;
}

export async function updateOption(eventId: string, optionId: string, userId: string, input: z.infer<typeof optionUpdateSchema>) {
  const option = await optionChurch(optionId, eventId);
  const prisma = await db();
  if (input.stock !== undefined && input.stock !== null) {
    const usage = await computeUsage(eventId, prisma);
    const used = usage.options.get(optionId) ?? 0;
    if (input.stock < used) throw new ApiError(400, `Déjà ${used} réservés : le stock ne descend pas en dessous`);
  }
  if (input.type && input.type !== option.type) {
    const count = await prisma.ticketingItem.count({ where: { optionId } });
    if (count > 0) throw new ApiError(400, "Option déjà choisie : son type ne change plus");
  }
  const updated = await prisma.ticketingOption.update({ where: { id: optionId }, data: input });
  await audit(userId, option.event.churchId, "UPDATE", "TicketingOption", optionId, { eventId, fields: Object.keys(input) });
  return updated;
}

/** Suppression d'une option jamais choisie ; sinon elle se désactive seulement. */
export async function deleteOption(eventId: string, optionId: string, userId: string) {
  const option = await optionChurch(optionId, eventId);
  const prisma = await db();
  const [items, sales] = await Promise.all([
    prisma.ticketingItem.count({ where: { optionId } }),
    prisma.ticketingOnsiteSale.count({ where: { optionId } }),
  ]);
  if (items + sales > 0) {
    await prisma.ticketingOption.update({ where: { id: optionId }, data: { active: false } });
    await audit(userId, option.event.churchId, "UPDATE", "TicketingOption", optionId, { eventId, active: false });
    return { deleted: false };
  }
  await prisma.ticketingOption.delete({ where: { id: optionId } });
  await audit(userId, option.event.churchId, "DELETE", "TicketingOption", optionId, { eventId, label: option.label });
  return { deleted: true };
}

// ── Rôles ────────────────────────────────────────────────────────────────────

/**
 * Remplace les rôles de l'événement. Seuls des comptes de l'église de l'événement peuvent être
 * nommés (STAR compris) ; les nouveaux titulaires sont prévenus.
 */
export async function setRoles(eventId: string, userId: string, roles: { userId: string; role: TicketingRole }[]) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true, title: true } });
  const userIds = [...new Set(roles.map((r) => r.userId))];
  const members = await prisma.userChurchRole.findMany({
    where: { churchId: event.churchId, userId: { in: userIds } },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId));
  const outside = userIds.filter((id) => !allowed.has(id));
  if (outside.length > 0) throw new ApiError(400, "Seuls des comptes de l'église peuvent recevoir un rôle");

  const before = await prisma.ticketingEventRole.findMany({ where: { eventId }, select: { userId: true, role: true } });
  const key = (r: { userId: string; role: string }) => `${r.userId}:${r.role}`;
  const beforeKeys = new Set(before.map(key));
  const unique = [...new Map(roles.map((r) => [key(r), r])).values()];
  await prisma.$transaction([
    prisma.ticketingEventRole.deleteMany({ where: { eventId } }),
    prisma.ticketingEventRole.createMany({ data: unique.map((r) => ({ eventId, userId: r.userId, role: r.role })) }),
  ]);
  await audit(userId, event.churchId, "UPDATE", "TicketingEventRole", eventId, {
    before: before.map(key),
    after: unique.map(key),
  });

  const added = [...new Set(unique.filter((r) => !beforeKeys.has(key(r))).map((r) => r.userId))].filter((id) => id !== userId);
  if (added.length > 0) {
    const { notifyUsers } = await import("@/lib/notifications");
    await notifyUsers(added, {
      domain: "ticketing",
      type: "TICKETING_ROLE",
      title: `Billetterie : ${event.title}`,
      message: "Un rôle vous a été confié sur cet événement.",
      link: `/billetterie/${eventId}`,
    });
  }
  return unique;
}

/** Comptes de l'église, pour le choix des rôles et de l'équipe. */
export async function listChurchAccounts(churchId: string) {
  const prisma = await db();
  const rows = await prisma.userChurchRole.findMany({
    where: { churchId },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const unique = new Map(rows.map((r) => [r.user.id, r.user]));
  return [...unique.values()].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "fr"));
}

// ── Lecture publique ─────────────────────────────────────────────────────────

/** Raison de fermeture des inscriptions, ou `null` si elles sont ouvertes. */
export function closedReason(
  event: Pick<TicketingEvent, "status" | "registrationDeadline" | "endsAt">,
  seatsRemaining: number,
  now = new Date()
): string | null {
  if (event.status === "DRAFT") return "Les inscriptions ne sont pas encore ouvertes.";
  if (event.status !== "OPEN") return "Les inscriptions sont closes.";
  if (event.registrationDeadline && now > event.registrationDeadline) return "La date limite d'inscription est passée.";
  if (now > event.endsAt) return "L'événement est terminé.";
  if (seatsRemaining <= 0) return "L'événement est complet.";
  return null;
}

/** Événement publié (ouvert ou clos), avec places et stock restants ; sinon `null`. */
export async function getPublicEvent(churchSlug: string, eventSlug: string): Promise<PublicEvent | null> {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findFirst({
    where: { slug: eventSlug, church: { slug: churchSlug }, status: { in: ["OPEN", "CLOSED"] } },
    include: {
      church: { select: { slug: true, name: true } },
      tariffs: true,
      options: {
        where: { active: true },
        orderBy: { position: "asc" },
        include: { variants: { where: { closed: false }, orderBy: { position: "asc" } } },
      },
    },
  });
  if (!event) return null;
  const usage = await computeUsage(event.id, prisma);
  const seatsRemaining = Math.max(0, event.seatsOpen - usage.seatsTaken);
  const reason = closedReason(event, seatsRemaining);
  return {
    id: event.id,
    churchSlug: event.church.slug ?? churchSlug,
    churchName: event.church.name,
    slug: event.slug,
    title: event.title,
    description: event.description,
    location: event.location,
    hasPoster: !!event.posterKey,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    registrationDeadline: event.registrationDeadline?.toISOString() ?? null,
    status: event.status,
    open: reason === null,
    closedReason: reason,
    seatsRemaining,
    tariffs: event.tariffs.map((t) => ({ ageGroup: t.ageGroup, price: Number(t.price) })),
    options: event.options.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description,
      type: o.type,
      scope: o.scope,
      price: Number(o.price),
      remaining: remaining(o.stock, usage.options.get(o.id) ?? 0),
      refundable: o.refundable,
      refundDeadline: o.refundDeadline?.toISOString() ?? null,
      variants: o.variants.map((v) => ({
        id: v.id,
        label: v.label,
        description: v.description,
        allergens: v.allergens,
        remaining: remaining(v.stock, usage.variants.get(v.id) ?? 0),
      })),
    })),
    questions: readQuestions(event.questions),
    methods: enabledMethods(readPaymentMethods(event.paymentMethods)),
    allowUnaccompaniedMinors: event.allowUnaccompaniedMinors,
    optionPaymentDeadline: event.optionPaymentDeadline?.toISOString() ?? null,
  };
}

// ── Affiche ──────────────────────────────────────────────────────────────────

const POSTER_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function sniffImage(buffer: Buffer): string | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

/** Dépôt de l'affiche (JPEG, PNG, WebP ≤ 3 Mo, type vérifié sur le contenu). */
export async function setPoster(eventId: string, userId: string, buffer: Buffer) {
  if (buffer.length > 3 * 1024 * 1024) throw new ApiError(400, "Affiche trop lourde (3 Mo au plus)");
  const mime = sniffImage(buffer);
  if (!mime) throw new ApiError(400, "Format d'image non pris en charge (JPEG, PNG ou WebP)");
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true, posterKey: true } });
  const { storeFile, deleteFile } = await import("@/lib/file-storage");
  const key = `ticketing/${event.churchId}/${eventId}/poster-${Date.now()}.${POSTER_TYPES[mime]}`;
  await storeFile(key, buffer, mime);
  await prisma.ticketingEvent.update({ where: { id: eventId }, data: { posterKey: key } });
  if (event.posterKey) await deleteFile(event.posterKey).catch(() => undefined);
  await audit(userId, event.churchId, "UPDATE", "TicketingEvent", eventId, { poster: "replaced" });
}

export async function removePoster(eventId: string, userId: string) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUniqueOrThrow({ where: { id: eventId }, select: { churchId: true, posterKey: true } });
  if (!event.posterKey) return;
  const { deleteFile } = await import("@/lib/file-storage");
  await prisma.ticketingEvent.update({ where: { id: eventId }, data: { posterKey: null } });
  await deleteFile(event.posterKey).catch(() => undefined);
  await audit(userId, event.churchId, "UPDATE", "TicketingEvent", eventId, { poster: "removed" });
}

/** Contenu de l'affiche d'un événement publié (ou de n'importe quel état pour l'équipe). */
export async function readPoster(eventId: string, publishedOnly: boolean) {
  const prisma = await db();
  const event = await prisma.ticketingEvent.findUnique({ where: { id: eventId }, select: { posterKey: true, status: true } });
  if (!event?.posterKey) return null;
  if (publishedOnly && !["OPEN", "CLOSED"].includes(event.status)) return null;
  const { readStoredFile } = await import("@/lib/file-storage");
  const buffer = await readStoredFile(event.posterKey);
  if (!buffer) return null;
  return { buffer, mime: sniffImage(buffer) ?? "application/octet-stream" };
}
