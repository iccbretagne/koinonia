import { DEFAULT_CATEGORIES, DEFAULT_PURPOSES } from "../schemas";
import { db } from "./common";

/**
 * Catégories et objets par défaut d'une église, créés à la première ouverture. Idempotent : les
 * contraintes d'unicité (nom par sens, catégorie système) empêchent tout doublon, y compris
 * quand une catégorie par défaut a été renommée.
 */
export async function ensureDefaults(churchId: string): Promise<void> {
  const prisma = await db();
  const count = await prisma.treasuryCategory.count({ where: { churchId } });
  if (count > 0) return;
  await prisma.treasuryCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({
      churchId,
      direction: c.direction,
      name: c.name,
      system: c.system ?? null,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
  await prisma.treasuryPurpose.createMany({
    data: DEFAULT_PURPOSES.map((name) => ({ churchId, name })),
    skipDuplicates: true,
  });
}
