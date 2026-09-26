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
 * Département système « Sans département » (ministère système « Système », `isSystem: true`)
 * de l'église — parking pour un STAR qui n'a plus aucun département réel. Existe pour chaque
 * église (créé à l'onboarding, cf. `POST /api/churches/onboard`) ; déjà utilisé pour un disciple
 * créé sans fiche STAR (`POST /api/discipleships`).
 */
async function getSystemDepartmentId(db: DbClient, churchId: string): Promise<string | null> {
  const sysDept = await db.department.findFirst({
    where: { isSystem: true, ministry: { churchId } },
    select: { id: true },
  });
  return sysDept?.id ?? null;
}

/**
 * Rattache un STAR existant à un département.
 *
 * Le PUT de la fiche STAR ne permet pas ce geste à un périmètre restreint : il ne liste que les
 * STAR déjà visibles. Ici le STAR peut venir de n'importe quel département de l'église, seul le
 * département de destination a déjà été vérifié dans le périmètre de l'appelant (route appelante).
 *
 * Rattacher un vrai département retire le parking système « Sans département » s'il y était :
 * ce dernier ne doit jamais rester cumulé à un vrai département (symétrique du retrait ci-dessous).
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

  const systemDeptId = await getSystemDepartmentId(db, churchId);
  const removeSystemDept =
    systemDeptId !== null &&
    systemDeptId !== departmentId &&
    member.departments.some((d) => d.departmentId === systemDeptId);
  const wasOnlySystemDept = removeSystemDept && member.departments.length === 1;

  await db.$transaction(async (tx) => {
    await tx.memberDepartment.create({
      data: { memberId, departmentId, isPrimary: member.departments.length === 0 || wasOnlySystemDept },
    });
    if (removeSystemDept) {
      await tx.memberDepartment.deleteMany({ where: { memberId, departmentId: systemDeptId! } });
    }
  });

  return db.member.findUniqueOrThrow({ where: { id: memberId }, include: memberDepartmentsInclude });
}

/**
 * Retire un STAR d'un département sans supprimer sa fiche.
 *
 * Le DELETE de la fiche refuse un STAR partiellement hors périmètre ; c'est ici que se fait le
 * retrait ciblé. Sur la dernière affiliation, plutôt que de refuser, le STAR bascule vers le
 * département système « Sans département » (parking) — sauf si c'est justement ce département
 * système qu'on retire, auquel cas il n'y a plus rien où basculer : là, on refuse toujours et on
 * oriente vers la suppression de la fiche.
 */
export async function detachMemberFromDepartment(
  memberId: string,
  departmentId: string,
  churchId: string,
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

  let fallbackDeptId: string | null = null;
  if (member.departments.length === 1) {
    const systemDeptId = await getSystemDepartmentId(db, churchId);
    if (!systemDeptId) throw new ApiError(500, "Département système introuvable pour cette église");
    if (systemDeptId === departmentId) {
      throw new ApiError(
        400,
        "C'est le seul département de ce STAR : supprimez sa fiche plutôt que de l'en retirer."
      );
    }
    fallbackDeptId = systemDeptId;
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

    if (fallbackDeptId) {
      // Plus aucun département réel : bascule vers le parking système plutôt que de laisser
      // le STAR sans aucune affiliation.
      await tx.memberDepartment.create({
        data: { memberId, departmentId: fallbackDeptId, isPrimary: true },
      });
    } else if (target.isPrimary) {
      // Le STAR garde un département principal
      const next = member.departments.find((d) => d.departmentId !== departmentId)!;
      await tx.memberDepartment.update({
        where: { memberId_departmentId: { memberId, departmentId: next.departmentId } },
        data: { isPrimary: true },
      });
    }
  });

  return db.member.findUniqueOrThrow({ where: { id: memberId }, include: memberDepartmentsInclude });
}
