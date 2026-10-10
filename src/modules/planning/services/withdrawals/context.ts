import type { DbClient } from "../availability/db";
import type { WithdrawalNotice } from "./notify";

/** Ce qu'il faut pour notifier autour d'un désistement : libellés et comptes liés au STAR désisté. */
export async function loadWithdrawalContext(
  db: DbClient,
  withdrawalId: string
): Promise<{
  notice: WithdrawalNotice;
  churchId: string;
  departmentId: string;
  memberId: string;
  event: { id: string; date: Date };
  starUserIds: string[];
} | null> {
  const w = await db.serviceWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: {
      id: true,
      churchId: true,
      departmentId: true,
      memberId: true,
      event: { select: { id: true, date: true } },
      department: { select: { name: true } },
      member: { select: { firstName: true, lastName: true } },
    },
  });
  if (!w) return null;
  const links = await db.memberUserLink.findMany({
    where: { memberId: w.memberId, churchId: w.churchId },
    select: { userId: true },
  });
  return {
    notice: {
      withdrawalId: w.id,
      eventId: w.event.id,
      eventDate: w.event.date,
      departmentName: w.department.name,
      memberName: `${w.member.firstName} ${w.member.lastName}`,
    },
    churchId: w.churchId,
    departmentId: w.departmentId,
    memberId: w.memberId,
    event: w.event,
    starUserIds: links.map((l) => l.userId),
  };
}
