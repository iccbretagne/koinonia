import { prisma } from "./prisma";
import type { Role } from "@/generated/prisma/client";
import type {
  KoinoniaConfigExport,
  ConfigCategory,
  MergeStrategy,
  ImportPreview,
  ImportResult,
  ChurchConfig,
  MemberConfig,
  MinistryConfig,
  UserLinkConfig,
  UserRoleConfig,
} from "./config-backup-types";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
      const effectiveChurchId = await upsertChurch(tx, church, strategy, result);

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Crée l'élément absent ; met à jour l'existant, sauf en SKIP où il est laissé tel quel.
 * Tient le compte du résultat et renvoie ce qui a été fait.
 */
async function createOrUpdate(
  exists: boolean,
  strategy: MergeStrategy,
  result: ImportResult,
  ops: { create: () => Promise<unknown>; update: () => Promise<unknown> }
): Promise<"created" | "updated" | "skipped"> {
  if (!exists) {
    await ops.create();
    result.created++;
    return "created";
  }
  if (strategy === "SKIP") {
    result.skipped++;
    return "skipped";
  }
  await ops.update();
  result.updated++;
  return "updated";
}

/** Supprime ce que le fichier ne contient plus ; une suppression refusée devient un avertissement. */
async function deleteOrphans<T extends { id: string; name: string }>(
  items: T[],
  keepIds: Set<string>,
  remove: (item: T) => Promise<unknown>,
  warning: (item: T) => string,
  result: ImportResult
) {
  for (const item of items) {
    if (keepIds.has(item.id)) continue;
    try {
      await remove(item);
      result.updated++;
    } catch {
      result.warnings.push(warning(item));
      result.skipped++;
    }
  }
}

async function departmentExists(tx: Tx, id: string) {
  return (await tx.department.findUnique({ where: { id }, select: { id: true } })) !== null;
}

/** Compte de l'instance cible par email ; absent, l'élément est ignoré avec un avertissement. */
async function findImportUser(tx: Tx, email: string, ignored: string, result: ImportResult) {
  const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    result.warnings.push(`${ignored} : utilisateur « ${email} » introuvable sur cette instance`);
    result.skipped++;
  }
  return user;
}

// ─── Church ───────────────────────────────────────────────────────────────────

/** Recherche par ID d'abord, puis par slug (cas cross-instance où l'ID diffère) ; renvoie l'ID effectif. */
async function upsertChurch(tx: Tx, church: ChurchConfig, strategy: MergeStrategy, result: ImportResult) {
  let existingChurch = await tx.church.findUnique({ where: { id: church.id }, select: { id: true } });
  existingChurch ??= await tx.church.findUnique({ where: { slug: church.slug }, select: { id: true } });
  const fields = {
    name: church.name,
    slug: church.slug,
    secretariatEmails: church.secretariatEmails,
    accountingEmails: church.accountingEmails,
    primaryColor: church.primaryColor,
  };
  await createOrUpdate(existingChurch !== null, strategy, result, {
    create: () => tx.church.create({ data: { id: church.id, ...fields } }),
    update: () => tx.church.update({ where: { id: existingChurch!.id }, data: fields }),
  });
  // L'ID effectif utilisé pour les opérations suivantes (structure, membres, liens)
  return existingChurch?.id ?? church.id;
}

// ─── Structure ────────────────────────────────────────────────────────────────

async function upsertMinistry(tx: Tx, ministry: MinistryConfig, churchId: string, strategy: MergeStrategy, result: ImportResult) {
  const exists = await tx.ministry.findUnique({ where: { id: ministry.id }, select: { id: true } });
  const fields = { name: ministry.name, isSystem: ministry.isSystem, churchId };
  await createOrUpdate(exists !== null, strategy, result, {
    create: () => tx.ministry.create({ data: { id: ministry.id, ...fields } }),
    update: () => tx.ministry.update({ where: { id: ministry.id }, data: fields }),
  });

  for (const dept of ministry.departments) {
    const deptFields = { name: dept.name, isSystem: dept.isSystem, function: dept.function, ministryId: ministry.id };
    await createOrUpdate(await departmentExists(tx, dept.id), strategy, result, {
      create: () => tx.department.create({ data: { id: dept.id, ...deptFields } }),
      update: () => tx.department.update({ where: { id: dept.id }, data: deptFields }),
    });
  }
}

async function applyStructure(tx: Tx, church: ChurchConfig, strategy: MergeStrategy, result: ImportResult) {
  for (const ministry of church.ministries) {
    await upsertMinistry(tx, ministry, church.id, strategy, result);
  }
  if (strategy !== "REPLACE") return;

  // REPLACE: delete orphaned departments/ministries (absent from file)
  await deleteOrphans(
    await tx.department.findMany({ where: { ministry: { churchId: church.id } }, select: { id: true, name: true } }),
    new Set(church.ministries.flatMap((m) => m.departments.map((d) => d.id))),
    async (dept) => {
      // Clean up FK dependencies before deleting
      await tx.memberDepartment.deleteMany({ where: { departmentId: dept.id } });
      await tx.userDepartment.deleteMany({ where: { departmentId: dept.id } });
      await tx.department.delete({ where: { id: dept.id } });
    },
    (dept) => `Département « ${dept.name} » (${dept.id}) ignoré : des données opérationnelles y sont rattachées`,
    result
  );
  await deleteOrphans(
    await tx.ministry.findMany({ where: { churchId: church.id }, select: { id: true, name: true } }),
    new Set(church.ministries.map((m) => m.id)),
    (ministry) => tx.ministry.delete({ where: { id: ministry.id } }),
    (ministry) => `Ministère « ${ministry.name} » (${ministry.id}) ignoré : des données y sont rattachées`,
    result
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────

async function upsertMember(tx: Tx, member: MemberConfig, strategy: MergeStrategy, result: ImportResult) {
  const exists = await tx.member.findUnique({ where: { id: member.id }, select: { id: true } });
  const fields = { firstName: member.firstName, lastName: member.lastName, email: member.email, phone: member.phone };
  const outcome = await createOrUpdate(exists !== null, strategy, result, {
    create: () => tx.member.create({ data: { id: member.id, ...fields } }),
    update: () => tx.member.update({ where: { id: member.id }, data: fields }),
  });
  if (outcome === "skipped") return;

  // Upsert MemberDepartment links
  for (const deptId of member.departmentIds) {
    if (!(await departmentExists(tx, deptId))) continue;
    const isPrimary = member.isPrimaryDeptId === deptId;
    await tx.memberDepartment.upsert({
      where: { memberId_departmentId: { memberId: member.id, departmentId: deptId } },
      create: { memberId: member.id, departmentId: deptId, isPrimary },
      update: strategy === "SKIP" ? {} : { isPrimary },
    });
  }
}

async function applyMembers(tx: Tx, church: ChurchConfig, strategy: MergeStrategy, result: ImportResult) {
  for (const member of church.members) {
    await upsertMember(tx, member, strategy, result);
  }
  if (strategy !== "REPLACE") return;

  // REPLACE: remove MemberDepartment for church depts not in file members
  const churchDeptIds = (
    await tx.department.findMany({ where: { ministry: { churchId: church.id } }, select: { id: true } })
  ).map((d) => d.id);
  if (churchDeptIds.length === 0) return;

  // Remove links for members not in the file
  await tx.memberDepartment.deleteMany({
    where: {
      departmentId: { in: churchDeptIds },
      memberId: { notIn: church.members.map((m) => m.id) },
    },
  });
  result.updated++;
}

// ─── Links & roles ────────────────────────────────────────────────────────────

/** REPLACE: wipe existing links/roles for this church. */
async function wipeLinksAndRoles(tx: Tx, churchId: string) {
  await tx.memberUserLink.deleteMany({ where: { churchId } });
  const roleIds = (await tx.userChurchRole.findMany({ where: { churchId }, select: { id: true } })).map((r) => r.id);
  if (roleIds.length > 0) {
    await tx.userDepartment.deleteMany({ where: { userChurchRoleId: { in: roleIds } } });
  }
  await tx.userChurchRole.deleteMany({ where: { churchId } });
}

async function importUserLink(tx: Tx, link: UserLinkConfig, churchId: string, strategy: MergeStrategy, result: ImportResult) {
  const user = await findImportUser(tx, link.userEmail, "Liaison membre ignorée", result);
  if (!user) return;

  const memberExists = await tx.member.findUnique({ where: { id: link.memberId }, select: { id: true } });
  if (!memberExists) {
    result.warnings.push(`Liaison membre ignorée : membre ${link.memberId} introuvable`);
    result.skipped++;
    return;
  }

  const validatedAt = link.validatedAt ? new Date(link.validatedAt) : null;
  // Après un REPLACE, la liaison vient d'être effacée : inutile de la chercher
  const exists =
    strategy === "REPLACE"
      ? null
      : await tx.memberUserLink.findFirst({ where: { memberId: link.memberId, churchId } });
  await createOrUpdate(exists !== null, strategy, result, {
    create: () => tx.memberUserLink.create({ data: { memberId: link.memberId, userId: user.id, churchId, validatedAt } }),
    update: () => tx.memberUserLink.update({ where: { id: exists!.id }, data: { validatedAt } }),
  });
}

async function importUserRole(tx: Tx, roleData: UserRoleConfig, churchId: string, strategy: MergeStrategy, result: ImportResult) {
  const user = await findImportUser(tx, roleData.userEmail, "Rôle ignoré", result);
  if (!user) return;

  const role = roleData.role as Role;
  // Après un REPLACE, les rôles viennent d'être effacés : inutile de les chercher
  const existingRole =
    strategy === "REPLACE"
      ? null
      : await tx.userChurchRole.findUnique({ where: { userId_churchId_role: { userId: user.id, churchId, role } } });

  await createOrUpdate(existingRole !== null, strategy, result, {
    create: async () => {
      const created = await tx.userChurchRole.create({
        data: { userId: user.id, churchId, role, ministryId: roleData.ministryId },
      });
      for (const deptId of roleData.departmentIds) {
        if (!(await departmentExists(tx, deptId))) continue;
        const ids = { userChurchRoleId: created.id, departmentId: deptId };
        if (strategy === "REPLACE") {
          await tx.userDepartment.create({ data: ids });
        } else {
          await tx.userDepartment.upsert({ where: { userChurchRoleId_departmentId: ids }, create: ids, update: {} });
        }
      }
    },
    update: () => tx.userChurchRole.update({ where: { id: existingRole!.id }, data: { ministryId: roleData.ministryId } }),
  });
}

async function applyLinks(tx: Tx, church: ChurchConfig, strategy: MergeStrategy, result: ImportResult) {
  if (strategy === "REPLACE") await wipeLinksAndRoles(tx, church.id);

  // MemberUserLinks
  for (const link of church.userLinks) {
    await importUserLink(tx, link, church.id, strategy, result);
  }
  // UserChurchRoles
  for (const roleData of church.userRoles) {
    await importUserRole(tx, roleData, church.id, strategy, result);
  }
}
