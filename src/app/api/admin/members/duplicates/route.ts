import { prisma } from "@/lib/prisma";
import { requireChurchPermission } from "@/lib/auth";
import { resolveMemberDepartmentScope } from "@/lib/member-scope";
import { successResponse, errorResponse, ApiError } from "@/lib/api-utils";

function compareCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

type Candidate = { id: string; firstName: string; lastName: string; email: string | null };

type DuplicateGroup<T> = {
  reason: "same_name" | "same_email" | "both";
  members: T[];
};

/** Regroupe par clé, en ignorant les éléments sans clé. */
function groupBy<T>(items: T[], keyOf: (item: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.values()].filter((bucket) => bucket.length >= 2);
}

// Clé de déduplication : ordre strictement point de code (peu importe, tant qu'il est stable)
const pairKey = (members: Candidate[]) => members.map((m) => m.id).sort(compareCodePoint).join("|");

/** Groupes de doublons : même nom normalisé, même email, ou les deux pour le même ensemble. */
function duplicateGroups<T extends Candidate>(members: T[]): DuplicateGroup<T>[] {
  const groups = new Map<string, DuplicateGroup<T>>();
  for (const bucket of groupBy(members, (m) => `${m.firstName.trim().toLowerCase()} ${m.lastName.trim().toLowerCase()}`)) {
    const key = pairKey(bucket);
    if (!groups.has(key)) groups.set(key, { reason: "same_name", members: bucket });
  }
  for (const bucket of groupBy(members, (m) => (m.email ? m.email.trim().toLowerCase() : null))) {
    const existing = groups.get(pairKey(bucket));
    if (existing) {
      existing.reason = "both";
    } else {
      groups.set(pairKey(bucket), { reason: "same_email", members: bucket });
    }
  }
  return [...groups.values()];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("churchId");
    if (!churchId) throw new ApiError(400, "churchId requis");
    const session = await requireChurchPermission("members:manage", churchId);

    // Filtré au périmètre de l'appelant — sinon un Resp. département verrait les emails de
    // toute l'église (spec 054/#583, même défaut que la page /admin/members/duplicates).
    const scope = await resolveMemberDepartmentScope(session, churchId);
    const membersWhere = scope.scoped
      ? { departments: { some: { departmentId: { in: scope.departmentIds } } } }
      : { departments: { some: { department: { ministry: { churchId } } } } };

    const members = await prisma.member.findMany({
      where: membersWhere,
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true, ministry: { select: { id: true, name: true } } } },
          },
          orderBy: { isPrimary: "desc" },
        },
        userLinks: { where: { churchId }, select: { userId: true, user: { select: { name: true, email: true } } } },
        _count: { select: { plannings: true, discipleships: true, disciplesMade: true } },
      },
    });

    return successResponse(duplicateGroups(members));
  } catch (error) {
    return errorResponse(error);
  }
}
