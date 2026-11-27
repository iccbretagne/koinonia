import { prisma } from "@/lib/prisma";

export type SourceOption = { type: "department" | "ministry"; id: string; label: string };

type SourceRole = {
  ministryId?: string | null;
  departments: { department: { id: string; name: string } }[];
};

/**
 * Options « au nom de » d'une demande : ministères puis départements des rôles de
 * l'utilisateur dans l'église courante, dans l'ordre des rôles et sans doublon.
 */
export async function buildSourceOptions(churchRoles: SourceRole[]): Promise<SourceOption[]> {
  const roleMinistryIds = churchRoles.flatMap((r) => (r.ministryId ? [r.ministryId] : []));
  const ministriesById = new Map(
    (
      await prisma.ministry.findMany({
        where: { id: { in: roleMinistryIds } },
        select: { id: true, name: true },
      })
    ).map((m) => [m.id, m])
  );

  const sourceOptions: SourceOption[] = [];
  const seenIds = new Set<string>();
  for (const role of churchRoles) {
    const ministry = role.ministryId ? ministriesById.get(role.ministryId) : undefined;
    if (ministry && !seenIds.has(ministry.id)) {
      sourceOptions.push({ type: "ministry", id: ministry.id, label: ministry.name });
      seenIds.add(ministry.id);
    }
    for (const { department } of role.departments) {
      if (!seenIds.has(department.id)) {
        sourceOptions.push({ type: "department", id: department.id, label: department.name });
        seenIds.add(department.id);
      }
    }
  }
  return sourceOptions;
}
