import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api-utils";

type DbClient = Prisma.TransactionClient;

/**
 * Import différé du singleton Prisma — évite d'instancier un vrai client
 * (driver adapter MariaDB) au simple chargement du module `planning`, ce qui
 * casserait les tests important `@/modules/planning` sans mocker `@/lib/prisma`.
 */
async function defaultDb(): Promise<DbClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

export type MemberLookupResult = {
  id: string;
  firstName: string;
  lastName: string;
  departmentIds: string[];
  departmentNames: string[];
};

/**
 * Recherche de STAR à l'échelle de l'église, sans filtre de périmètre.
 *
 * Complète le périmètre de gestion (`resolveMemberDepartmentScope`) : pour rattacher un STAR
 * existant à son département, un responsable doit d'abord pouvoir le trouver hors de son
 * périmètre. La réponse se limite donc à l'identité et aux départements d'appartenance.
 */
export async function searchMembersChurchWide(
  churchId: string,
  query: string,
  db?: DbClient
): Promise<MemberLookupResult[]> {
  if (query.length < 2) return [];
  db ??= await defaultDb();

  const members = await db.member.findMany({
    where: {
      departments: { some: { department: { ministry: { churchId } } } },
      OR: [{ firstName: { contains: query } }, { lastName: { contains: query } }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departments: { select: { departmentId: true, department: { select: { name: true } } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
  });

  return members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    departmentIds: m.departments.map((d) => d.departmentId),
    departmentNames: m.departments.map((d) => d.department.name),
  }));
}

const memberDepartmentsInclude = {
  departments: {
    include: {
      department: {
        select: { id: true, name: true, ministry: { select: { id: true, name: true } } },
      },
    },
    orderBy: { isPrimary: "desc" as const },
  },
};

/**
 * Rattache un STAR existant à un département.
 *
 * Le PUT de la fiche STAR ne permet pas ce geste à un périmètre restreint : il ne liste que les
 * STAR déjà visibles. Ici le STAR peut venir de n'importe quel département de l'église, seul le
 * département de destination a déjà été vérifié dans le périmètre de l'appelant (route appelante).
 */
export async function attachMemberToDepartment(
  memberId: string,
  departmentId: string,
  churchId: string,
  db?: DbClient
) {
  db ??= await defaultDb();

  const member = await db.member.findUnique({
    where: { id: memberId },
    include: {
      departments: {
        select: { departmentId: true, department: { select: { ministry: { select: { churchId: true } } } } },
      },
    },
  });
  if (!member) throw new ApiError(404, "STAR introuvable");
  if (member.departments.some((d) => d.department.ministry.churchId !== churchId)) {
    throw new ApiError(403, "Ce STAR n'appartient pas à cette église");
  }
  if (member.departments.some((d) => d.departmentId === departmentId)) {
    throw new ApiError(409, "Ce STAR appartient déjà à ce département");
  }

  await db.memberDepartment.create({
    data: { memberId, departmentId, isPrimary: member.departments.length === 0 },
  });

  return db.member.findUniqueOrThrow({ where: { id: memberId }, include: memberDepartmentsInclude });
}

/**
 * Retire un STAR d'un département sans supprimer sa fiche.
 *
 * Le DELETE de la fiche refuse un STAR partiellement hors périmètre ; c'est ici que se fait le
 * retrait ciblé. Refusé sur la dernière affiliation : un STAR sans département n'appartiendrait
 * plus à aucune église.
 */
export async function detachMemberFromDepartment(
  memberId: string,
  departmentId: string,
  db?: DbClient
) {
  db ??= await defaultDb();

  const member = await db.member.findUnique({
    where: { id: memberId },
    include: { departments: { select: { departmentId: true, isPrimary: true } } },
  });
  if (!member) throw new ApiError(404, "STAR introuvable");

  const target = member.departments.find((d) => d.departmentId === departmentId);
  if (!target) throw new ApiError(404, "Ce STAR n'appartient pas à ce département");
  if (member.departments.length === 1) {
    throw new ApiError(
      400,
      "C'est le seul département de ce STAR : supprimez sa fiche plutôt que de l'en retirer."
    );
  }

  await db.$transaction(async (tx) => {
    await tx.memberDepartment.deleteMany({ where: { memberId, departmentId } });

    // Le planning et les tâches à venir dans ce département n'ont plus lieu d'être
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await tx.planning.deleteMany({
      where: {
        memberId,
        eventDepartment: { departmentId, event: { date: { gte: today } } },
      },
    });
    await tx.taskAssignment.deleteMany({
      where: { memberId, event: { date: { gte: today } }, task: { departmentId } },
    });

    // Le STAR garde un département principal
    if (target.isPrimary) {
      const next = member.departments.find((d) => d.departmentId !== departmentId)!;
      await tx.memberDepartment.update({
        where: { memberId_departmentId: { memberId, departmentId: next.departmentId } },
        data: { isPrimary: true },
      });
    }
  });

  return db.member.findUniqueOrThrow({ where: { id: memberId }, include: memberDepartmentsInclude });
}
