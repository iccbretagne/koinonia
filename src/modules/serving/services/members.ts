import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-utils";
import type { ServingActor } from "../auth";
import { loadApplication } from "./applications";

/**
 * Fiches STAR existantes qui pourraient correspondre à la personne (spec 073), pour éviter un
 * doublon à l'accueil : même nom (recherche de l'annuaire, injectée par la route — le module ne
 * peut pas importer `planning`) ou même adresse email dans l'église.
 */

export type MemberSearch = (
  churchId: string,
  query: string
) => Promise<{ id: string; firstName: string; lastName: string; departmentNames: string[] }[]>;

export type MemberMatch = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  departmentNames: string[];
  reason: "name" | "email" | "both";
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export async function findMemberMatches(actor: ServingActor, id: string, search: MemberSearch): Promise<MemberMatch[]> {
  if (!actor.canManage) throw new Error("FORBIDDEN");
  const app = await loadApplication(id);
  if (!app || app.churchId !== actor.churchId) throw new ApiError(404, "Candidature introuvable");

  const byName = (await search(actor.churchId, app.lastName)).filter(
    (m) => norm(m.lastName) === norm(app.lastName) && norm(m.firstName) === norm(app.firstName)
  );
  const byEmail = app.email
    ? await prisma.member.findMany({
        where: {
          email: app.email,
          departments: { some: { department: { ministry: { churchId: actor.churchId } } } },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          departments: { select: { department: { select: { name: true } } } },
        },
        take: 10,
      })
    : [];

  const matches = new Map<string, MemberMatch>();
  for (const m of byEmail) {
    matches.set(m.id, {
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      departmentNames: m.departments.map((d) => d.department.name),
      reason: "email",
    });
  }
  for (const m of byName) {
    const existing = matches.get(m.id);
    if (existing) existing.reason = "both";
    else matches.set(m.id, { ...m, email: null, reason: "name" });
  }
  return [...matches.values()];
}

/**
 * Fiches STAR en observation par département, pour le badge « En observation » de la gestion des
 * membres.
 */
export async function listObservationMemberIds(churchId: string): Promise<{ memberId: string; departmentId: string }[]> {
  const rows = await prisma.servingAssignment.findMany({
    where: { status: "OBSERVATION", application: { churchId, memberId: { not: null } } },
    select: { departmentId: true, application: { select: { memberId: true } } },
  });
  return rows.map((r) => ({ memberId: r.application.memberId!, departmentId: r.departmentId }));
}
