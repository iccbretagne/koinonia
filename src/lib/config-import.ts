import { prisma } from "./prisma";
import type {
  KoinoniaConfigExport,
  ConfigCategory,
  MergeStrategy,
  ImportPreview,
  ImportResult,
  ChurchConfig,
} from "./config-backup-types";

export async function previewImport(data: KoinoniaConfigExport): Promise<ImportPreview> {
  if (data._meta.schemaVersion !== 1) {
    throw new Error(`Version de schéma non supportée : ${data._meta.schemaVersion}`);
  }

  const churchIds = data.churches.map((c) => c.id);
  const churchSlugs = data.churches.map((c) => c.slug);
  const existing = await prisma.church.findMany({
    where: { OR: [{ id: { in: churchIds } }, { slug: { in: churchSlugs } }] },
    select: { id: true, slug: true },
  });
  const existingIds = new Set(existing.map((c) => c.id));
  const existingSlugs = new Set(existing.map((c) => c.slug));

  let ministries = 0;
  let departments = 0;
  let members = 0;
  let userLinks = 0;
  let userRoles = 0;

  for (const church of data.churches) {
    for (const m of church.ministries) {
      ministries++;
      departments += m.departments.length;
    }
    members += church.members.length;
    userLinks += church.userLinks.length;
    userRoles += church.userRoles.length;
  }

  return {
    schemaVersion: data._meta.schemaVersion,
    exportedAt: data._meta.exportedAt,
    churches: data.churches.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      existsInTarget: existingIds.has(c.id) || existingSlugs.has(c.slug),
    })),
    counts: { ministries, departments, members, userLinks, userRoles },
  };
}

export async function applyImport(
  data: KoinoniaConfigExport,
  strategy: MergeStrategy,
  categories: ConfigCategory[]
): Promise<ImportResult> {
  if (data._meta.schemaVersion !== 1) {
    throw new Error(`Version de schéma non supportée : ${data._meta.schemaVersion}`);
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: 0, warnings: [] };

  await prisma.$transaction(async (tx) => {
    for (const church of data.churches) {
      // ── Upsert church ────────────────────────────────────────
      // Recherche par ID d'abord, puis par slug (cas cross-instance où l'ID diffère)
      let existingChurch = await tx.church.findUnique({ where: { id: church.id }, select: { id: true } });
      if (!existingChurch) {
        existingChurch = await tx.church.findUnique({ where: { slug: church.slug }, select: { id: true } });
      }
      // L'ID effectif utilisé pour les opérations suivantes (structure, membres, liens)
      const effectiveChurchId = existingChurch?.id ?? church.id;

      if (existingChurch) {
        if (strategy !== "SKIP") {
          await tx.church.update({
            where: { id: existingChurch.id },
            data: {
              name: church.name,
              slug: church.slug,
              secretariatEmail: church.secretariatEmail,
              accountingEmail: church.accountingEmail,
              primaryColor: church.primaryColor,
            },
          });
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        await tx.church.create({
          data: {
            id: church.id,
            name: church.name,
            slug: church.slug,
            secretariatEmail: church.secretariatEmail,
            accountingEmail: church.accountingEmail,
            primaryColor: church.primaryColor,
          },
        });
        result.created++;
      }

      // Réécrit church.id avec l'ID effectif pour les opérations suivantes
      const churchWithEffectiveId = { ...church, id: effectiveChurchId };

      // ── Structure ─────────────────────────────────────────────
      if (categories.includes("structure")) {
        await applyStructure(tx, churchWithEffectiveId, strategy, result);
      }

      // ── Members ───────────────────────────────────────────────
      if (categories.includes("members")) {
        await applyMembers(tx, churchWithEffectiveId, strategy, result);
      }

      // ── Links & roles ─────────────────────────────────────────
      if (categories.includes("links")) {
        await applyLinks(tx, churchWithEffectiveId, strategy, result);
      }
    }
  }, { timeout: 60_000 });

  return result;
}

// ─── Structure ────────────────────────────────────────────────────────────────

async function applyStructure(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  church: ChurchConfig,
  strategy: MergeStrategy,
  result: ImportResult
) {
  const fileMinistryIds = new Set(church.ministries.map((m) => m.id));
  const fileDeptIds = new Set(
    church.ministries.flatMap((m) => m.departments.map((d) => d.id))
  );

  for (const ministry of church.ministries) {
    const exists = await tx.ministry.findUnique({ where: { id: ministry.id }, select: { id: true } });
    if (exists) {
      if (strategy !== "SKIP") {
        await tx.ministry.update({
          where: { id: ministry.id },
          data: { name: ministry.name, isSystem: ministry.isSystem, churchId: church.id },
        });
        result.updated++;
      } else {
        result.skipped++;
      }
    } else {
      await tx.ministry.create({
        data: { id: ministry.id, name: ministry.name, isSystem: ministry.isSystem, churchId: church.id },
      });
      result.created++;
    }

    for (const dept of ministry.departments) {
      const deptExists = await tx.department.findUnique({ where: { id: dept.id }, select: { id: true } });
      if (deptExists) {
        if (strategy !== "SKIP") {
          await tx.department.update({
            where: { id: dept.id },
            data: { name: dept.name, isSystem: dept.isSystem, function: dept.function, ministryId: ministry.id },
          });
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        await tx.department.create({
          data: { id: dept.id, name: dept.name, isSystem: dept.isSystem, function: dept.function, ministryId: ministry.id },
        });
        result.created++;
      }
    }
  }

  // REPLACE: delete orphaned departments/ministries (absent from file)
  if (strategy === "REPLACE") {
    const existingDepts = await tx.department.findMany({
      where: { ministry: { churchId: church.id } },
      select: { id: true, name: true },
    });
    for (const dept of existingDepts) {
      if (!fileDeptIds.has(dept.id)) {
        try {
          // Clean up FK dependencies before deleting
          await tx.memberDepartment.deleteMany({ where: { departmentId: dept.id } });
          await tx.userDepartment.deleteMany({ where: { departmentId: dept.id } });
          await tx.department.delete({ where: { id: dept.id } });
          result.updated++;
        } catch {
          result.warnings.push(
            `Département « ${dept.name} » (${dept.id}) ignoré : des données opérationnelles y sont rattachées`
          );
          result.skipped++;
        }
      }
    }

    const existingMinistries = await tx.ministry.findMany({
      where: { churchId: church.id },
      select: { id: true, name: true },
    });
    for (const ministry of existingMinistries) {
      if (!fileMinistryIds.has(ministry.id)) {
        try {
          await tx.ministry.delete({ where: { id: ministry.id } });
          result.updated++;
        } catch {
          result.warnings.push(
            `Ministère « ${ministry.name} » (${ministry.id}) ignoré : des données y sont rattachées`
          );
          result.skipped++;
        }
      }
    }
  }
}

// ─── Members ──────────────────────────────────────────────────────────────────

async function applyMembers(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  church: ChurchConfig,
  strategy: MergeStrategy,
  result: ImportResult
) {
  const fileMemberIds = new Set(church.members.map((m) => m.id));

  for (const member of church.members) {
    const exists = await tx.member.findUnique({ where: { id: member.id }, select: { id: true } });
    if (exists) {
      if (strategy !== "SKIP") {
        await tx.member.update({
          where: { id: member.id },
          data: {
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            phone: member.phone,
          },
        });
        result.updated++;
      } else {
        result.skipped++;
        continue;
      }
    } else {
      await tx.member.create({
        data: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
        },
      });
      result.created++;
    }

    // Upsert MemberDepartment links
    for (const deptId of member.departmentIds) {
      const deptExists = await tx.department.findUnique({ where: { id: deptId }, select: { id: true } });
      if (!deptExists) continue;
      await tx.memberDepartment.upsert({
        where: { memberId_departmentId: { memberId: member.id, departmentId: deptId } },
        create: {
          memberId: member.id,
          departmentId: deptId,
          isPrimary: member.isPrimaryDeptId === deptId,
        },
        update: strategy !== "SKIP"
          ? { isPrimary: member.isPrimaryDeptId === deptId }
          : {},
      });
    }
  }

  // REPLACE: remove MemberDepartment for church depts not in file members
  if (strategy === "REPLACE") {
    const churchDeptIds = (
      await tx.department.findMany({
        where: { ministry: { churchId: church.id } },
        select: { id: true },
      })
    ).map((d) => d.id);

    if (churchDeptIds.length > 0) {
      // Remove links for members not in the file
      await tx.memberDepartment.deleteMany({
        where: {
          departmentId: { in: churchDeptIds },
          memberId: { notIn: Array.from(fileMemberIds) },
        },
      });
      result.updated++;
    }
  }
}

// ─── Links & roles ────────────────────────────────────────────────────────────

async function applyLinks(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  church: ChurchConfig,
  strategy: MergeStrategy,
  result: ImportResult
) {
  // REPLACE: wipe existing links/roles for this church
  if (strategy === "REPLACE") {
    await tx.memberUserLink.deleteMany({ where: { churchId: church.id } });
    const roleIds = (
      await tx.userChurchRole.findMany({
        where: { churchId: church.id },
        select: { id: true },
      })
    ).map((r) => r.id);
    if (roleIds.length > 0) {
      await tx.userDepartment.deleteMany({ where: { userChurchRoleId: { in: roleIds } } });
    }
    await tx.userChurchRole.deleteMany({ where: { churchId: church.id } });
  }

  // MemberUserLinks
  for (const link of church.userLinks) {
    const user = await tx.user.findUnique({
      where: { email: link.userEmail },
      select: { id: true },
    });
    if (!user) {
      result.warnings.push(
        `Liaison membre ignorée : utilisateur « ${link.userEmail} » introuvable sur cette instance`
      );
      result.skipped++;
      continue;
    }

    const memberExists = await tx.member.findUnique({ where: { id: link.memberId }, select: { id: true } });
    if (!memberExists) {
      result.warnings.push(
        `Liaison membre ignorée : membre ${link.memberId} introuvable`
      );
      result.skipped++;
      continue;
    }

    if (strategy === "REPLACE") {
      await tx.memberUserLink.create({
        data: {
          memberId: link.memberId,
          userId: user.id,
          churchId: church.id,
          validatedAt: link.validatedAt ? new Date(link.validatedAt) : null,
        },
      });
      result.created++;
    } else {
      const exists = await tx.memberUserLink.findFirst({
        where: { memberId: link.memberId, churchId: church.id },
      });
      if (exists) {
        if (strategy === "UPDATE") {
          await tx.memberUserLink.update({
            where: { id: exists.id },
            data: { validatedAt: link.validatedAt ? new Date(link.validatedAt) : null },
          });
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        await tx.memberUserLink.create({
          data: {
            memberId: link.memberId,
            userId: user.id,
            churchId: church.id,
            validatedAt: link.validatedAt ? new Date(link.validatedAt) : null,
          },
        });
        result.created++;
      }
    }
  }

  // UserChurchRoles
  for (const roleData of church.userRoles) {
    const user = await tx.user.findUnique({
      where: { email: roleData.userEmail },
      select: { id: true },
    });
    if (!user) {
      result.warnings.push(
        `Rôle ignoré : utilisateur « ${roleData.userEmail} » introuvable sur cette instance`
      );
      result.skipped++;
      continue;
    }

    if (strategy === "REPLACE") {
      const role = await tx.userChurchRole.create({
        data: {
          userId: user.id,
          churchId: church.id,
          role: roleData.role as import("@/generated/prisma/client").Role,
          ministryId: roleData.ministryId,
        },
      });
      for (const deptId of roleData.departmentIds) {
        const deptExists = await tx.department.findUnique({ where: { id: deptId }, select: { id: true } });
        if (!deptExists) continue;
        await tx.userDepartment.create({
          data: { userChurchRoleId: role.id, departmentId: deptId },
        });
      }
      result.created++;
    } else {
      const existingRole = await tx.userChurchRole.findUnique({
        where: { userId_churchId_role: { userId: user.id, churchId: church.id, role: roleData.role as import("@/generated/prisma/client").Role } },
      });
      if (existingRole) {
        if (strategy !== "SKIP") {
          await tx.userChurchRole.update({
            where: { id: existingRole.id },
            data: { ministryId: roleData.ministryId },
          });
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        const role = await tx.userChurchRole.create({
          data: {
            userId: user.id,
            churchId: church.id,
            role: roleData.role as import("@/generated/prisma/client").Role,
            ministryId: roleData.ministryId,
          },
        });
        for (const deptId of roleData.departmentIds) {
          const deptExists = await tx.department.findUnique({ where: { id: deptId }, select: { id: true } });
          if (!deptExists) continue;
          await tx.userDepartment.upsert({
            where: { userChurchRoleId_departmentId: { userChurchRoleId: role.id, departmentId: deptId } },
            create: { userChurchRoleId: role.id, departmentId: deptId },
            update: {},
          });
        }
        result.created++;
      }
    }
  }
}
