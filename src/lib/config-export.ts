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
  const allMinistriesWithDepts = includeStructure
    ? await prisma.ministry.findMany({
        where: { churchId: { in: churches.map((c) => c.id) } },
        include: { departments: true },
        orderBy: { name: "asc" },
      })
    : [];

  const ministriesByChurch = new Map<string, typeof allMinistriesWithDepts>();
  for (const m of allMinistriesWithDepts) {
    const list = ministriesByChurch.get(m.churchId) ?? [];
    list.push(m);
    ministriesByChurch.set(m.churchId, list);
  }

  const churchConfigs: ChurchConfig[] = await Promise.all(
    churches.map(async (church) => {
      // ── Structure ────────────────────────────────────────────
      const churchMinistries = ministriesByChurch.get(church.id) ?? [];
      const ministries: MinistryConfig[] = churchMinistries.map((m) => ({
        id: m.id,
        name: m.name,
        isSystem: m.isSystem,
        departments: m.departments.map((d) => ({
          id: d.id,
          name: d.name,
          isSystem: d.isSystem,
          function: d.function ?? null,
        })),
      }));

      // Collect all dept IDs for this church (needed for member queries)
      const churchDeptIds = churchMinistries.flatMap((m) =>
        m.departments.map((d) => d.id)
      );

      // ── Members ──────────────────────────────────────────────
      let members: MemberConfig[] = [];
      if (includeMembers) {
        // Find all dept IDs for this church (may not have loaded if !includeStructure)
        let deptIds = churchDeptIds;
        if (!includeStructure) {
          const depts = await prisma.department.findMany({
            where: { ministry: { churchId: church.id } },
            select: { id: true },
          });
          deptIds = depts.map((d) => d.id);
        }

        if (deptIds.length > 0) {
          const memberDepts = await prisma.memberDepartment.findMany({
            where: { departmentId: { in: deptIds } },
            include: { member: true },
          });

          // Deduplicate members (a member can be in multiple depts)
          const memberMap = new Map<string, MemberConfig>();
          for (const md of memberDepts) {
            const existing = memberMap.get(md.memberId);
            if (existing) {
              existing.departmentIds.push(md.departmentId);
              if (md.isPrimary) existing.isPrimaryDeptId = md.departmentId;
            } else {
              memberMap.set(md.memberId, {
                id: md.member.id,
                firstName: md.member.firstName,
                lastName: md.member.lastName,
                email: md.member.email ?? null,
                phone: md.member.phone ?? null,
                departmentIds: [md.departmentId],
                isPrimaryDeptId: md.isPrimary ? md.departmentId : null,
              });
            }
          }
          members = Array.from(memberMap.values());
        }
      }

      // ── Links & roles ────────────────────────────────────────
      let userLinks: UserLinkConfig[] = [];
      let userRoles: UserRoleConfig[] = [];
      if (includeLinks) {
        const links = await prisma.memberUserLink.findMany({
          where: { churchId: church.id },
          include: { user: { select: { email: true } } },
        });
        userLinks = links.map((l) => ({
          memberId: l.memberId,
          userEmail: l.user.email,
          churchId: l.churchId,
          validatedAt: l.validatedAt?.toISOString() ?? null,
        }));

        const roles = await prisma.userChurchRole.findMany({
          where: { churchId: church.id },
          include: {
            user: { select: { email: true } },
            departments: { select: { departmentId: true, isDeputy: true } },
          },
        });
        userRoles = roles.map((r) => ({
          userEmail: r.user.email,
          role: r.role,
          ministryId: r.ministryId ?? null,
          departmentIds: r.departments.map((d) => d.departmentId),
        }));
      }

      return {
        id: church.id,
        name: church.name,
        slug: church.slug,
        secretariatEmail: church.secretariatEmail ?? null,
        accountingEmail: church.accountingEmail ?? null,
        primaryColor: church.primaryColor,
        ministries,
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
