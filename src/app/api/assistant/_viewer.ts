import type { Session } from "next-auth";
import type { AssistantViewer } from "@/core/assistant";
import { prisma } from "@/lib/prisma";
import { registry, rolePermissions } from "@/lib/registry";
import type { Predicate } from "@/modules/assistant";

/**
 * Ce que l'assistant sait de la personne (spec 075), calculé **côté serveur** pour l'église
 * courante uniquement : rôles, permissions (`rolePermissions`), prédicats d'accès (mêmes règles
 * que la navigation de `(auth)/layout.tsx`) et modules actifs. Rien n'est déduit du client.
 */

const TEAM_FUNCTIONS: Record<"secretariatTeam" | "mediaTeam" | "integrationTeam", string[]> = {
  secretariatTeam: ["SECRETARIAT"],
  mediaTeam: ["PRODUCTION_MEDIA", "COMMUNICATION", "PHOTOS"],
  integrationTeam: ["INTEGRATION", "MSDP"],
};

async function teamPredicates(departmentIds: string[], churchId: string): Promise<Predicate[]> {
  if (departmentIds.length === 0) return [];
  const departments = await prisma.department.findMany({
    where: { id: { in: departmentIds }, ministry: { churchId }, function: { not: null } },
    select: { function: true },
  });
  const functions = new Set(departments.map((d) => d.function as string));
  return (Object.keys(TEAM_FUNCTIONS) as (keyof typeof TEAM_FUNCTIONS)[]).filter((p) =>
    TEAM_FUNCTIONS[p].some((fn) => functions.has(fn))
  );
}

export async function buildViewer(session: Session, churchId: string): Promise<AssistantViewer> {
  const churchRoles = session.user.churchRoles.filter((r) => r.churchId === churchId);
  const roles = [...new Set([...churchRoles.map((r) => r.role as string), ...(session.user.isSuperAdmin ? ["SUPER_ADMIN"] : [])])];
  const permissions = [...new Set(roles.flatMap((r) => rolePermissions[r] ?? []))];
  const departmentIds = [...new Set(churchRoles.flatMap((r) => r.departments.map((d) => d.department.id)))];

  const predicates: Predicate[] = [];
  const [link, teams] = await Promise.all([
    prisma.memberUserLink.findUnique({
      where: { userId_churchId: { userId: session.user.id!, churchId } },
      select: { id: true },
    }),
    teamPredicates(departmentIds, churchId),
  ]);
  if (link) predicates.push("linkedStar");
  predicates.push(...teams);
  if ((session.user.pastoralChurchIds ?? []).includes(churchId)) predicates.push("pastoral");

  if (registry.has("shuttle")) {
    const { getShuttleAccess } = await import("@/modules/shuttle");
    const access = await getShuttleAccess(session, churchId).catch(() => null);
    if (access?.member) predicates.push("shuttleTeam");
  }
  if (registry.has("ticketing")) {
    const { isTicketingVisible } = await import("@/modules/ticketing");
    if (await isTicketingVisible(session, churchId).catch(() => false)) predicates.push("ticketing");
  }
  if (registry.has("planning") && permissions.includes("planning:view")) {
    const { canReadAnnouncementSheet } = await import("@/modules/planning");
    if (await canReadAnnouncementSheet(session, churchId).catch(() => false)) predicates.push("announcementSheet");
  }

  if (registry.has("media") && churchRoles.length > 0) {
    // Même règle que `requireMediaGalleryAccess` : media:view, équipe média, Ministre média,
    // ou accès nominatif valide (spec 080).
    const { isMediaMinister, hasValidGalleryGrant } = await import("@/lib/auth");
    const viaTeam = permissions.includes("media:view") || teams.includes("mediaTeam");
    if (viaTeam || (await isMediaMinister(session, churchId)) || (await hasValidGalleryGrant(session.user.id!, churchId))) {
      predicates.push("mediaGallery");
    }
  }

  const churchIds = new Set([...session.user.churchRoles.map((r) => r.churchId), ...(session.user.pastoralChurchIds ?? [])]);
  return {
    userId: session.user.id!,
    churchId,
    churchName: churchRoles[0]?.church.name ?? "",
    churchCount: churchIds.size,
    isSuperAdmin: !!session.user.isSuperAdmin,
    roles,
    permissions,
    predicates,
    modules: registry.list().map((m) => m.name),
  };
}
