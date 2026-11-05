import { ApiError } from "@/lib/api-utils";
import type { TreasuryCategory, TreasuryDirection, TreasuryPurpose } from "@/generated/prisma/client";
import { audit, db, type TreasuryActor } from "./common";
import { ensureDefaults } from "./defaults";

/**
 * Catégories et objets d'offrandes spéciales (spec 076), modifiables par l'église. Une catégorie
 * ou un objet déjà utilisé ne se supprime pas : il se désactive. Une catégorie système (remise,
 * notes de frais, navette, offrandes spéciales) se renomme et se désactive, jamais ne se supprime.
 */

export interface CategoryView {
  id: string;
  direction: TreasuryDirection;
  name: string;
  system: TreasuryCategory["system"];
  active: boolean;
  sortOrder: number;
}

export interface PurposeView {
  id: string;
  name: string;
  active: boolean;
}

const categoryView = (c: TreasuryCategory): CategoryView => ({
  id: c.id,
  direction: c.direction,
  name: c.name,
  system: c.system,
  active: c.active,
  sortOrder: c.sortOrder,
});
const purposeView = (p: TreasuryPurpose): PurposeView => ({ id: p.id, name: p.name, active: p.active });

export async function listCategories(churchId: string): Promise<CategoryView[]> {
  await ensureDefaults(churchId);
  const prisma = await db();
  const rows = await prisma.treasuryCategory.findMany({
    where: { churchId },
    orderBy: [{ direction: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(categoryView);
}

export async function listPurposes(churchId: string): Promise<PurposeView[]> {
  await ensureDefaults(churchId);
  const prisma = await db();
  const rows = await prisma.treasuryPurpose.findMany({ where: { churchId }, orderBy: { name: "asc" } });
  return rows.map(purposeView);
}

/** Catégorie système de l'église (créée au besoin avec les catégories par défaut). */
export async function getSystemCategory(churchId: string, system: NonNullable<TreasuryCategory["system"]>) {
  await ensureDefaults(churchId);
  const prisma = await db();
  const category = await prisma.treasuryCategory.findFirst({ where: { churchId, system } });
  if (!category) throw new ApiError(500, "Catégorie système manquante");
  return category;
}

async function assertUniqueCategory(churchId: string, direction: TreasuryDirection, name: string, selfId?: string) {
  const prisma = await db();
  const existing = await prisma.treasuryCategory.findFirst({
    where: { churchId, direction, name, ...(selfId ? { NOT: { id: selfId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Une catégorie porte déjà ce nom");
}

export async function createCategory(
  churchId: string,
  input: { direction: TreasuryDirection; name: string; sortOrder?: number },
  actor: TreasuryActor
) {
  await ensureDefaults(churchId);
  await assertUniqueCategory(churchId, input.direction, input.name);
  const prisma = await db();
  const created = await prisma.treasuryCategory.create({
    data: { churchId, direction: input.direction, name: input.name, sortOrder: input.sortOrder ?? 100 },
  });
  await audit(churchId, actor, "CREATE", "TreasuryCategory", created.id, { after: categoryView(created) });
  return categoryView(created);
}

export async function getCategoryChurchId(id: string): Promise<string | null> {
  const prisma = await db();
  return (await prisma.treasuryCategory.findUnique({ where: { id }, select: { churchId: true } }))?.churchId ?? null;
}

export async function getPurposeChurchId(id: string): Promise<string | null> {
  const prisma = await db();
  return (await prisma.treasuryPurpose.findUnique({ where: { id }, select: { churchId: true } }))?.churchId ?? null;
}

export async function updateCategory(
  id: string,
  patch: { name?: string; active?: boolean; sortOrder?: number },
  actor: TreasuryActor
) {
  const prisma = await db();
  const existing = await prisma.treasuryCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Catégorie introuvable");
  if (patch.name && patch.name !== existing.name) {
    await assertUniqueCategory(existing.churchId, existing.direction, patch.name, id);
  }
  const updated = await prisma.treasuryCategory.update({ where: { id }, data: patch });
  await audit(existing.churchId, actor, "UPDATE", "TreasuryCategory", id, {
    before: categoryView(existing),
    after: categoryView(updated),
  });
  return categoryView(updated);
}

export async function deleteCategory(id: string, actor: TreasuryActor) {
  const prisma = await db();
  const existing = await prisma.treasuryCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Catégorie introuvable");
  if (existing.system) throw new ApiError(409, "Cette catégorie est nécessaire à Koinonia : désactivez-la plutôt.");
  const [entries, budgets] = await Promise.all([
    prisma.treasuryEntry.count({ where: { categoryId: id } }),
    prisma.treasuryBudget.count({ where: { categoryId: id } }),
  ]);
  if (entries + budgets > 0) throw new ApiError(409, "Cette catégorie est déjà utilisée : désactivez-la plutôt.");
  await prisma.treasuryCategory.delete({ where: { id } });
  await audit(existing.churchId, actor, "DELETE", "TreasuryCategory", id, { before: categoryView(existing) });
}

async function assertUniquePurpose(churchId: string, name: string, selfId?: string) {
  const prisma = await db();
  const existing = await prisma.treasuryPurpose.findFirst({
    where: { churchId, name, ...(selfId ? { NOT: { id: selfId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, "Un objet porte déjà ce nom");
}

export async function createPurpose(churchId: string, name: string, actor: TreasuryActor) {
  await assertUniquePurpose(churchId, name);
  const prisma = await db();
  const created = await prisma.treasuryPurpose.create({ data: { churchId, name } });
  await audit(churchId, actor, "CREATE", "TreasuryPurpose", created.id, { after: purposeView(created) });
  return purposeView(created);
}

export async function updatePurpose(id: string, patch: { name?: string; active?: boolean }, actor: TreasuryActor) {
  const prisma = await db();
  const existing = await prisma.treasuryPurpose.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Objet introuvable");
  if (patch.name && patch.name !== existing.name) await assertUniquePurpose(existing.churchId, patch.name, id);
  const updated = await prisma.treasuryPurpose.update({ where: { id }, data: patch });
  await audit(existing.churchId, actor, "UPDATE", "TreasuryPurpose", id, {
    before: purposeView(existing),
    after: purposeView(updated),
  });
  return purposeView(updated);
}

export async function deletePurpose(id: string, actor: TreasuryActor) {
  const prisma = await db();
  const existing = await prisma.treasuryPurpose.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Objet introuvable");
  const used = await prisma.treasuryEntry.count({ where: { purposeId: id } });
  if (used > 0) throw new ApiError(409, "Cet objet est déjà utilisé : désactivez-le plutôt.");
  await prisma.treasuryPurpose.delete({ where: { id } });
  await audit(existing.churchId, actor, "DELETE", "TreasuryPurpose", id, { before: purposeView(existing) });
}
