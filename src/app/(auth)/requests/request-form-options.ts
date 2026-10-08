import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { rolePermissions } from "@/lib/registry";
import { buildSourceOptions } from "./source-options";

const ANNOUNCEMENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const EVENT_SELECT = { id: true, title: true, type: true, date: true } as const;

function serializeEvent(e: { id: string; title: string; type: string; date: Date }) {
  return { id: e.id, title: e.title, type: e.type, date: e.date.toISOString() };
}

/**
 * Données communes aux pages de création et d'édition d'une demande : droits de l'appelant
 * dans l'église et listes de choix du formulaire.
 */
export async function loadRequestFormData(session: Session, churchId: string) {
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const churchPermissions = new Set(churchRoles.flatMap((r) => rolePermissions[r.role] ?? []));
  const canSubmitDemands = churchPermissions.has("planning:edit") || session.user.isSuperAdmin;

  const now = new Date();
  const in90days = new Date(now.getTime() + ANNOUNCEMENT_WINDOW_MS);

  const [announcementEvents, events, sourceOptions, departments, users, ministries] = await Promise.all([
    // Annonces : événements ouverts aux annonces, dans les 90 prochains jours
    prisma.event.findMany({
      where: { churchId, date: { gte: now, lte: in90days }, allowAnnouncements: true },
      select: EVENT_SELECT,
      orderBy: { date: "asc" },
    }),
    // Demandes de modification/annulation : tous les événements à venir
    prisma.event.findMany({
      where: { churchId, date: { gte: now } },
      select: EVENT_SELECT,
      orderBy: { date: "asc" },
    }),
    // Options « au nom de » (départements/ministères des rôles de l'utilisateur)
    buildSourceOptions(churchRoles),
    // Départements pour les demandes de modification de planning
    prisma.department.findMany({
      where: { ministry: { churchId } },
      select: { id: true, name: true, ministry: { select: { name: true } } },
      orderBy: [{ ministry: { name: "asc" } }, { name: "asc" }],
    }),
    // Utilisateurs et ministères pour les demandes d'accès
    prisma.user.findMany({
      where: { churchRoles: { some: { churchId } } },
      select: { id: true, name: true, displayName: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.ministry.findMany({
      where: { churchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    churchPermissions,
    canSubmitDemands,
    formOptions: {
      announcementEvents: announcementEvents.map(serializeEvent),
      events: events.map(serializeEvent),
      sourceOptions,
      departments: departments.map((d) => ({ id: d.id, name: d.name, ministryName: d.ministry.name })),
      users: users.map((u) => ({ id: u.id, label: u.displayName ?? u.name ?? u.email })),
      ministries,
    },
  };
}
