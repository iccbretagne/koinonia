import { prisma } from "./prisma";
import type {
  ConfigCategory,
  KoinoniaConfigExport,
  ChurchConfig,
  MinistryConfig,
  MemberConfig,
  UserLinkConfig,
  UserRoleConfig,
} from "./config-backup-types";

type MinistryWithDepartments = Awaited<ReturnType<typeof loadMinistries>>[number];

/** Ministères et départements, chargés en une requête puis répartis par église. */
async function loadMinistries(churchIds: string[]) {
  return prisma.ministry.findMany({
    where: { churchId: { in: churchIds } },
    include: { departments: true },
    orderBy: { name: "asc" },
  });
}

function toMinistryConfig(m: MinistryWithDepartments): MinistryConfig {
  return {
    id: m.id,
    name: m.name,
    isSystem: m.isSystem,
    departments: m.departments.map((d) => ({
      id: d.id,
      name: d.name,
      isSystem: d.isSystem,
      function: d.function ?? null,
    })),
  };
}

/** STAR des départements donnés, un par personne avec tous ses départements. */
async function exportMembers(deptIds: string[]): Promise<MemberConfig[]> {
  if (deptIds.length === 0) return [];
  const memberDepts = await prisma.memberDepartment.findMany({
    where: { departmentId: { in: deptIds } },
    include: { member: true },
  });

  // Deduplicate members (a member can be in multiple depts)
  const memberMap = new Map<string, MemberConfig>();
  for (const md of memberDepts) {
    const member = memberMap.get(md.memberId) ?? {
      id: md.member.id,
      firstName: md.member.firstName,
      lastName: md.member.lastName,
      email: md.member.email ?? null,
      phone: md.member.phone ?? null,
      departmentIds: [],
      isPrimaryDeptId: null,
    };
    member.departmentIds.push(md.departmentId);
    if (md.isPrimary) member.isPrimaryDeptId = md.departmentId;
    memberMap.set(md.memberId, member);
  }
  return Array.from(memberMap.values());
}

/** Départements de l'église : ceux de la structure déjà chargée, sinon relus. */
async function churchDepartmentIds(churchId: string, ministries: MinistryWithDepartments[] | null) {
  if (ministries) return ministries.flatMap((m) => m.departments.map((d) => d.id));
  const depts = await prisma.department.findMany({
    where: { ministry: { churchId } },
    select: { id: true },
  });
  return depts.map((d) => d.id);
}

async function exportLinksAndRoles(churchId: string): Promise<{ userLinks: UserLinkConfig[]; userRoles: UserRoleConfig[] }> {
  const links = await prisma.memberUserLink.findMany({
    where: { churchId },
    include: { user: { select: { email: true } } },
  });
  const roles = await prisma.userChurchRole.findMany({
    where: { churchId },
    include: {
      user: { select: { email: true } },
      departments: { select: { departmentId: true, isDeputy: true } },
    },
  });
  return {
    userLinks: links.map((l) => ({
      memberId: l.memberId,
      userEmail: l.user.email,
      churchId: l.churchId,
      validatedAt: l.validatedAt?.toISOString() ?? null,
    })),
    userRoles: roles.map((r) => ({
      userEmail: r.user.email,
      role: r.role,
      ministryId: r.ministryId ?? null,
      departmentIds: r.departments.map((d) => d.departmentId),
    })),
  };
}

export async function exportConfig(
  scope: "all" | string[],
  categories: ConfigCategory[],
  exportedBy: string,
  appVersion: string
): Promise<KoinoniaConfigExport> {
  const includeStructure = categories.includes("structure");
  const includeMembers = categories.includes("members");
  const includeLinks = categories.includes("links");

  const churchWhere = scope === "all" ? undefined : { id: { in: scope } };
  const churches = await prisma.church.findMany({
    where: churchWhere,
    orderBy: { name: "asc" },
  });

  // Load ministries+departments separately to avoid conditional-include typing issues
  const allMinistriesWithDepts = includeStructure ? await loadMinistries(churches.map((c) => c.id)) : [];
  const ministriesByChurch = new Map<string, MinistryWithDepartments[]>();
  for (const m of allMinistriesWithDepts) {
    ministriesByChurch.set(m.churchId, [...(ministriesByChurch.get(m.churchId) ?? []), m]);
  }

  const churchConfigs: ChurchConfig[] = await Promise.all(
    churches.map(async (church) => {
      const churchMinistries = ministriesByChurch.get(church.id) ?? [];
      const members = includeMembers
        ? await exportMembers(await churchDepartmentIds(church.id, includeStructure ? churchMinistries : null))
        : [];
      const { userLinks, userRoles } = includeLinks
        ? await exportLinksAndRoles(church.id)
        : { userLinks: [], userRoles: [] };

      return {
        id: church.id,
        name: church.name,
        slug: church.slug,
        secretariatEmails: church.secretariatEmails ?? null,
        accountingEmails: church.accountingEmails ?? null,
        primaryColor: church.primaryColor,
        ministries: churchMinistries.map(toMinistryConfig),
        members,
        userLinks,
        userRoles,
      };
    })
  );

  return {
    _meta: {
      appVersion,
      exportedAt: new Date().toISOString(),
      exportedBy,
      schemaVersion: 1,
      scope,
      categories,
    },
    churches: churchConfigs,
  };
}
