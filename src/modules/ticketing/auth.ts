import type { Session } from "next-auth";
import type { PrismaClient, TicketingEventStatus, TicketingRole } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { ApiError } from "@/lib/errors";

type Db = Pick<PrismaClient, "ticketingEvent" | "ticketingEventRole">;

export interface EventAccess {
  eventId: string;
  churchId: string;
  status: TicketingEventStatus;
  /** `ticketing:manage` dans l'église de l'événement (ou Super Admin). */
  manager: boolean;
  roles: Set<TicketingRole>;
}

/**
 * Matrice des actions (plan 074, « Accès ») : rôles d'événement admis pour chaque geste.
 * Les services et les routes s'y réfèrent, les tests la vérifient.
 */
export const EVENT_ACTIONS = {
  configure: ["ORGANIZER"],
  payments: ["ORGANIZER", "TREASURER"],
  reception: ["ORGANIZER", "RECEPTION"],
  catering: ["ORGANIZER", "CATERING"],
  menu: ["ORGANIZER", "CATERING"],
  read: ["ORGANIZER", "TREASURER", "RECEPTION", "CATERING", "OBSERVER"],
} as const satisfies Record<string, readonly TicketingRole[]>;
export type EventAction = keyof typeof EVENT_ACTIONS;

async function defaultDb(): Promise<Db> {
  return (await import("@/lib/prisma")).prisma;
}

/** `ticketing:manage` (ou Super Admin) dans `churchId`. */
export async function isTicketingManager(session: Session, churchId: string): Promise<boolean> {
  if (session.user.isSuperAdmin) return true;
  const roles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  if (roles.length === 0) return false;
  const { rolePermissions } = await import("@/lib/registry");
  return roles.some((r) => (rolePermissions[r.role] ?? []).includes("ticketing:manage"));
}

/**
 * Droits d'un compte sur un événement de billetterie (spec 074). L'église qui fait foi est celle
 * de l'événement, jamais le contexte affiché : un événement d'une autre église, ou introuvable,
 * répond 404. Le détenteur de `ticketing:manage` est organisateur implicite ; les rôles
 * attribués s'arrêtent à la clôture (`ARCHIVED`).
 */
export async function getEventAccess(session: Session, eventId: string, db?: Db): Promise<EventAccess> {
  db ??= await defaultDb();
  const event = await db.ticketingEvent.findUnique({
    where: { id: eventId },
    select: { id: true, churchId: true, status: true },
  });
  const inChurch =
    !!event && (session.user.isSuperAdmin || session.user.churchRoles.some((r) => r.churchId === event.churchId));
  if (!event || !inChurch) throw new ApiError(404, "Événement introuvable");

  const manager = await isTicketingManager(session, event.churchId);
  const roles = new Set<TicketingRole>();
  if (manager) roles.add("ORGANIZER");
  if (event.status !== "ARCHIVED") {
    const granted = await db.ticketingEventRole.findMany({
      where: { eventId, userId: session.user.id },
      select: { role: true },
    });
    for (const g of granted) roles.add(g.role);
  }
  return { eventId: event.id, churchId: event.churchId, status: event.status, manager, roles };
}

export function canDo(access: Pick<EventAccess, "roles">, action: EventAction): boolean {
  return EVENT_ACTIONS[action].some((r) => access.roles.has(r));
}

/** Session et droits sur l'événement, ou `FORBIDDEN` si aucun rôle n'autorise `action`. */
export async function requireEventAction(eventId: string, action: EventAction) {
  const session = await requireAuth();
  const access = await getEventAccess(session, eventId);
  if (!canDo(access, action)) throw new Error("FORBIDDEN");
  return { session, access };
}

/** Variante par liste explicite de rôles (au moins un requis). */
export async function requireEventRole(eventId: string, allowed: readonly TicketingRole[]) {
  const session = await requireAuth();
  const access = await getEventAccess(session, eventId);
  if (!allowed.some((r) => access.roles.has(r))) throw new Error("FORBIDDEN");
  return { session, access };
}

/** Lien « Billetterie » : `ticketing:manage` dans l'église, ou un rôle sur un événement actif. */
export async function isTicketingVisible(
  session: Session,
  churchId: string | null | undefined,
  db?: Pick<PrismaClient, "ticketingEventRole">
): Promise<boolean> {
  if (!churchId) return false;
  const { registry } = await import("@/lib/registry");
  if (!registry.has("ticketing")) return false;
  if (await isTicketingManager(session, churchId)) return true;
  db ??= await defaultDb();
  try {
    const count = await db.ticketingEventRole.count({
      where: { userId: session.user.id, event: { churchId, status: { not: "ARCHIVED" } } },
    });
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
