import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { DeptFunction } from "@/lib/department-functions";

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Identifiants des départements d'une église portant une fonction donnée (spec 046) — une
 * fonction peut désormais être portée par plusieurs départements ; ce helper remplace les
 * `findFirst({ function })` qui n'en retenaient qu'un arbitrairement. Tri par `id` pour un
 * résultat déterministe (aucun choix arbitraire entre départements d'une même fonction).
 */
export async function getFunctionDepartmentIds(
  churchId: string,
  fn: DeptFunction,
  db: DbClient = prisma
): Promise<string[]> {
  const departments = await db.department.findMany({
    where: { function: fn, ministry: { churchId } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return departments.map((d) => d.id);
}

/**
 * Vrai si un des départements de l'utilisateur (`userDeptIds`) porte la fonction donnée dans
 * cette église.
 */
export async function isMemberOfFunction(
  userDeptIds: string[],
  churchId: string,
  fn: DeptFunction,
  db: DbClient = prisma
): Promise<boolean> {
  if (userDeptIds.length === 0) return false;
  const functionDeptIds = await getFunctionDepartmentIds(churchId, fn, db);
  return functionDeptIds.some((id) => userDeptIds.includes(id));
}

/**
 * Départements (id + nom) de plusieurs fonctions à la fois, en une seule requête — alimente
 * l'affichage du destinataire d'une demande (spec 046) sans requête par demande.
 */
export async function getFunctionDepartmentsMap(
  churchId: string,
  fns: DeptFunction[],
  db: DbClient = prisma
): Promise<Map<DeptFunction, { id: string; name: string }[]>> {
  const uniqueFns = Array.from(new Set(fns));
  const departments = await db.department.findMany({
    where: { function: { in: uniqueFns }, ministry: { churchId } },
    select: { id: true, name: true, function: true },
    orderBy: { name: "asc" },
  });
  const map = new Map<DeptFunction, { id: string; name: string }[]>();
  for (const fn of uniqueFns) map.set(fn, []);
  for (const dept of departments) {
    if (!dept.function) continue;
    map.get(dept.function as DeptFunction)?.push({ id: dept.id, name: dept.name });
  }
  return map;
}
