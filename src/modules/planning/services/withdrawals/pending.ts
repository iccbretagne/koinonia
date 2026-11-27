import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma/client";
import { defaultDb, type DbClient } from "../availability/db";

/**
 * Services « À remplacer » (spec 061, file de l'Accueil spec 092) : désistements en attente sur un
 * événement à venir, dans le périmètre de responsabilité de l'appelant. Une seule règle, lue par
 * l'Accueil et par la question `planning.toReplace` de l'assistant.
 */

export interface PendingWithdrawalItem {
  id: string;
  date: Date;
  eventTitle: string;
  departmentName: string;
}

/**
 * Filtre des désistements que l'appelant peut traiter, ou `null` s'il n'a pas `planning:edit` dans
 * l'église (aucune file, pas même vide). Un périmètre restreint vide ne voit rien (ADR-0009).
 */
export async function pendingWithdrawalsWhere(
  session: Session,
  churchId: string,
  now: Date = new Date()
): Promise<Prisma.ServiceWithdrawalWhereInput | null> {
  // Import différé : `@/lib/auth` instancie NextAuth au chargement (voir opening-closing.service).
  const { getUserDepartmentScope, hasChurchPermission } = await import("@/lib/auth");
  if (!(await hasChurchPermission(session, "planning:edit", churchId))) return null;
  const scope = getUserDepartmentScope(session, churchId);
  return {
    churchId,
    status: "PENDING",
    event: { churchId, date: { gte: now } },
    ...(scope.scoped ? { departmentId: { in: scope.departmentIds } } : {}),
  };
}

/**
 * Nombre et premiers services à remplacer (du plus proche au plus lointain), ou `null` sans droit.
 * Rien de nominatif : ni le STAR désisté ni son message.
 */
export async function listPendingWithdrawals(
  session: Session,
  churchId: string,
  { take = 5, now = new Date(), db }: { take?: number; now?: Date; db?: DbClient } = {}
): Promise<{ count: number; items: PendingWithdrawalItem[] } | null> {
  const where = await pendingWithdrawalsWhere(session, churchId, now);
  if (!where) return null;
  db ??= await defaultDb();
  const [count, rows] = await Promise.all([
    db.serviceWithdrawal.count({ where }),
    db.serviceWithdrawal.findMany({
      where,
      select: { id: true, event: { select: { title: true, date: true } }, department: { select: { name: true } } },
      orderBy: [{ event: { date: "asc" } }, { id: "asc" }],
      take,
    }),
  ]);
  return {
    count,
    items: rows.map((r) => ({ id: r.id, date: r.event.date, eventTitle: r.event.title, departmentName: r.department.name })),
  };
}
